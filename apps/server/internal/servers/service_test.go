package servers

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"

	"serverui/server/internal/crypto"
	sshx "serverui/server/internal/ssh"
)

func testService(t *testing.T) *Service {
	t.Helper()
	key, err := crypto.RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := crypto.New(key)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(NewMemoryStore(), box)
	svc.SetDialer(func(cfg sshx.Config, auth sshx.AuthMethod) error {
		if cfg.Host == "offline.example" {
			return fmt.Errorf("connection refused")
		}
		if cfg.Username == "denied" {
			return fmtAuthFailed()
		}
		return nil
	})
	return svc
}

type authFailedError struct{}

func (authFailedError) Error() string { return "unable to authenticate" }

func fmtAuthFailed() error { return authFailedError{} }

func TestCreateGetDeleteDoesNotReturnSecrets(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name:     "Production",
		Host:     "203.0.113.10",
		Port:     22,
		Username: "deploy",
		AuthType: AuthPassword,
		Password: "super-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Status != StatusOnline {
		t.Fatalf("status %s", created.Status)
	}
	raw, _ := json.Marshal(created)
	if strings.Contains(string(raw), "super-secret") {
		t.Fatal("credential leaked in create response")
	}

	got, err := svc.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ = json.Marshal(got)
	if strings.Contains(string(raw), "super-secret") || strings.Contains(string(raw), `"password":`) || strings.Contains(string(raw), `"privateKey":`) {
		t.Fatalf("credential leaked in get: %s", raw)
	}

	list, err := svc.List(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("list %v %d", err, len(list))
	}

	updated, err := svc.Update(ctx, created.ID, Input{
		Name:     "Prod",
		Host:     "203.0.113.10",
		Port:     22,
		Username: "deploy",
		AuthType: AuthPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Prod" {
		t.Fatalf("name %s", updated.Name)
	}

	if err := svc.Delete(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Get(ctx, created.ID); err != ErrNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestIconUpdateDoesNotReconnect(t *testing.T) {
	svc := testService(t)
	svc.SetIconDir(t.TempDir())
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Lab", Host: "203.0.113.10", Port: 22, Username: "deploy",
		AuthType: AuthPassword, Password: "secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.IconID != DefaultIconID || created.Status != StatusOnline {
		t.Fatalf("created %+v", created)
	}
	dials := 0
	svc.SetDialer(func(cfg sshx.Config, auth sshx.AuthMethod) error {
		dials++
		return fmt.Errorf("should not dial")
	})
	updated, err := svc.Update(ctx, created.ID, Input{
		Name: "Lab", Host: "203.0.113.10", Port: 22, Username: "deploy",
		AuthType: AuthPassword, IconID: "cloud",
	})
	if err != nil {
		t.Fatal(err)
	}
	if dials != 0 || updated.Status != StatusOnline || updated.IconID != "cloud" {
		t.Fatalf("dials %d status %s icon %s", dials, updated.Status, updated.IconID)
	}
	// Moving to another host needs the secret again: the saved one is never reused for it.
	if _, err = svc.Update(ctx, created.ID, Input{
		Name: "Lab", Host: "203.0.113.11", Port: 22, Username: "deploy",
		AuthType: AuthPassword, IconID: "cloud",
	}); err == nil {
		t.Fatal("host change without a new secret must be refused")
	}
	_, err = svc.Update(ctx, created.ID, Input{
		Name: "Lab", Host: "203.0.113.11", Port: 22, Username: "deploy",
		AuthType: AuthPassword, Password: "pw-for-new-host", IconID: "cloud",
	})
	if err != nil {
		t.Fatal(err)
	}
	if dials != 1 {
		t.Fatalf("host change dials %d", dials)
	}
}

func TestCredentialIsolation(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	a, err := svc.Create(ctx, Input{
		Name: "server-A", Host: "10.0.0.1", Port: 22, Username: "alice",
		AuthType: AuthPassword, Password: "alice-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.Create(ctx, Input{
		Name: "server-B", Host: "10.0.0.2", Port: 22, Username: "bob",
		AuthType: AuthPassword, Password: "bob-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	credA, err := svc.store.GetCredential(ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	credB, err := svc.store.GetCredential(ctx, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if credA.EncryptedSecret == credB.EncryptedSecret {
		t.Fatal("credentials should not share ciphertext")
	}
	secretA, err := svc.box.Decrypt(credA.EncryptedSecret)
	if err != nil || secretA != "alice-secret" {
		t.Fatalf("server A secret mismatch")
	}
	secretB, err := svc.box.Decrypt(credB.EncryptedSecret)
	if err != nil || secretB != "bob-secret" {
		t.Fatalf("server B secret mismatch")
	}

	cfgA, authA, err := svc.loadAuth(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfgA.Username != "alice" {
		t.Fatalf("loaded A username %s", cfgA.Username)
	}
	passA, ok := authA.(sshx.PasswordAuth)
	if !ok || passA.Password != "alice-secret" {
		t.Fatal("loaded A used the wrong credential")
	}
	cfgB, authB, err := svc.loadAuth(b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfgB.Username != "bob" {
		t.Fatalf("loaded B username %s", cfgB.Username)
	}
	passB, ok := authB.(sshx.PasswordAuth)
	if !ok || passB.Password != "bob-secret" {
		t.Fatal("loaded B used the wrong credential")
	}
}

func TestCreateRejectsMissingPassword(t *testing.T) {
	svc := testService(t)
	_, err := svc.Create(context.Background(), Input{
		Name: "X", Host: "10.0.0.1", Port: 22, Username: "u", AuthType: AuthPassword,
	})
	if err == nil || err.Error() != "password is required" {
		t.Fatalf("got %v", err)
	}
}

func TestSaveCredentialsOffKeepsSecretInMemoryOnly(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	off := false
	created, err := svc.Create(ctx, Input{
		Name: "Lab", Host: "203.0.113.20", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "hunter2", SaveCredentials: &off,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.CredentialsSaved {
		t.Fatal("secret should not be stored")
	}
	cred, err := svc.store.GetCredential(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if plain, _ := svc.box.Decrypt(cred.EncryptedSecret); plain != "" {
		t.Fatalf("stored secret %q", plain)
	}
	// Same running session: the secret entered at creation still works.
	if _, _, err := svc.loadAuth(created.ID); err != nil {
		t.Fatalf("session secret: %v", err)
	}
	// A fresh process (new service, same store) has no secret and must ask for one.
	fresh := NewService(svc.store, svc.box)
	if _, _, err := fresh.loadAuth(created.ID); !errors.Is(err, ErrSecretRequired) {
		t.Fatalf("want ErrSecretRequired, got %v", err)
	}
	fresh.SetDialer(svc.dial)
	if _, err := fresh.Test(ctx, created.ID); !errors.Is(err, ErrSecretRequired) {
		t.Fatalf("test without secret: %v", err)
	}
}

func TestSaveCredentialsDefaultStoresEncryptedSecret(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Prod", Host: "203.0.113.21", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "hunter2",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !created.CredentialsSaved {
		t.Fatal("secret should be stored by default")
	}
	fresh := NewService(svc.store, svc.box)
	if _, _, err := fresh.loadAuth(created.ID); err != nil {
		t.Fatalf("stored secret should survive a restart: %v", err)
	}
}

func TestUpdateTogglesSecretStorage(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Prod", Host: "203.0.113.22", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "hunter2",
	})
	if err != nil {
		t.Fatal(err)
	}
	off, on := false, true
	in := Input{Name: "Prod", Host: "203.0.113.22", Port: 22, Username: "me", AuthType: AuthPassword}
	in.SaveCredentials = &off
	got, err := svc.Update(ctx, created.ID, in)
	if err != nil || got.CredentialsSaved {
		t.Fatalf("turn off: %v saved=%v", err, got.CredentialsSaved)
	}
	in.SaveCredentials = &on
	if _, err := svc.Update(ctx, created.ID, in); err == nil {
		t.Fatal("turning saving on needs a secret")
	}
	in.Password = "new-secret"
	got, err = svc.Update(ctx, created.ID, in)
	if err != nil || !got.CredentialsSaved {
		t.Fatalf("turn on: %v saved=%v", err, got.CredentialsSaved)
	}
}

func TestConnectWithSuppliedSecret(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	off := false
	created, err := svc.Create(ctx, Input{
		Name: "Lab", Host: "203.0.113.23", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "hunter2", SaveCredentials: &off,
	})
	if err != nil {
		t.Fatal(err)
	}
	fresh := NewService(svc.store, svc.box)
	fresh.SetDialer(svc.dial)
	if _, err := fresh.Connect(ctx, created.ID, &Secret{}); err == nil {
		t.Fatal("empty supplied secret must be rejected")
	}
	if _, err := fresh.Connect(ctx, created.ID, nil); !errors.Is(err, ErrSecretRequired) {
		t.Fatalf("want ErrSecretRequired, got %v", err)
	}
}

func encryptedKey(t *testing.T, passphrase string) string {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKeyWithPassphrase(priv, "test", []byte(passphrase))
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(block))
}

func TestPassphraseProtectedKeyIsStoredAndUsed(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	key := encryptedKey(t, "correct horse")
	base := Input{
		Name: "Key box", Host: "203.0.113.30", Port: 22, Username: "me",
		AuthType: AuthPrivateKey, PrivateKey: key,
	}

	if _, err := svc.Create(ctx, base); err == nil || !strings.Contains(err.Error(), "passphrase") {
		t.Fatalf("missing passphrase should be reported, got %v", err)
	}
	wrong := base
	wrong.Passphrase = "wrong"
	if _, err := svc.Create(ctx, wrong); err == nil || !strings.Contains(err.Error(), "passphrase") {
		t.Fatalf("wrong passphrase should be reported, got %v", err)
	}

	good := base
	good.Passphrase = "correct horse"
	created, err := svc.Create(ctx, good)
	if err != nil {
		t.Fatal(err)
	}
	// A fresh service reads the stored secret back, passphrase included.
	fresh := NewService(svc.store, svc.box)
	if _, _, err := fresh.loadAuth(created.ID); err != nil {
		t.Fatalf("stored key and passphrase should load: %v", err)
	}
	cred, _ := svc.store.GetCredential(ctx, created.ID)
	if plain, _ := svc.box.Decrypt(cred.EncryptedSecret); strings.Contains(string(plain), "correct horse") == false {
		t.Fatal("passphrase should be part of the encrypted secret")
	}
}

func TestPlainKeysKeepTheirOldStoredForm(t *testing.T) {
	if packKey("-----BEGIN KEY-----", "") != "-----BEGIN KEY-----" {
		t.Fatal("keys without a passphrase must stay plain")
	}
	key, pass := unpackKey("-----BEGIN KEY-----")
	if key != "-----BEGIN KEY-----" || pass != "" {
		t.Fatalf("unpack plain: %q %q", key, pass)
	}
	key, pass = unpackKey(packKey("KEYDATA", "pw"))
	if key != "KEYDATA" || pass != "pw" {
		t.Fatalf("unpack packed: %q %q", key, pass)
	}
}

func TestHostKeyIsPinnedOnFirstConnectionAndResetWhenTheSecretIsEnteredAgain(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	svc.SetDialer(func(cfg sshx.Config, auth sshx.AuthMethod) error {
		if cfg.PinnedHostKey != "" && cfg.PinnedHostKey != "SHA256:first" {
			return fmt.Errorf("host key mismatch")
		}
		if cfg.PinnedHostKey == "" && cfg.OnHostKey != nil {
			if err := cfg.OnHostKey("SHA256:first"); err != nil {
				return err
			}
		}
		return nil
	})
	created, err := svc.Create(ctx, Input{
		Name: "Prod", Host: "203.0.113.40", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "pw",
	})
	if err != nil {
		t.Fatal(err)
	}
	rec, _ := svc.store.Get(ctx, created.ID)
	if rec.HostKey != "SHA256:first" {
		t.Fatalf("host key not pinned on first connection: %q", rec.HostKey)
	}
	// Ordinary status updates must not wipe the pin.
	rec.Status = StatusOffline
	if err := svc.store.Update(ctx, rec); err != nil {
		t.Fatal(err)
	}
	if rec, _ = svc.store.Get(ctx, created.ID); rec.HostKey != "SHA256:first" {
		t.Fatalf("a status update dropped the pin: %q", rec.HostKey)
	}
	// Entering the secret again is how the operator accepts a new key: the pin is cleared and
	// the next connection pins whatever the server presents.
	if _, err := svc.Update(ctx, created.ID, Input{
		Name: "Prod", Host: "203.0.113.40", Port: 22, Username: "me", AuthType: AuthPassword, Password: "pw2",
	}); err != nil {
		t.Fatal(err)
	}
	if rec, _ = svc.store.Get(ctx, created.ID); rec.HostKey != "SHA256:first" {
		t.Fatalf("expected the reconnect to pin again, got %q", rec.HostKey)
	}
	// Renaming alone keeps the pin untouched.
	if _, err := svc.Update(ctx, created.ID, Input{
		Name: "Prod 2", Host: "203.0.113.40", Port: 22, Username: "me", AuthType: AuthPassword,
	}); err != nil {
		t.Fatal(err)
	}
	if rec, _ = svc.store.Get(ctx, created.ID); rec.HostKey != "SHA256:first" || rec.Name != "Prod 2" {
		t.Fatalf("rename changed the pin: %+v", rec)
	}
}

func TestOnlyOneFirstUseKeyIsPinnedAndTheOtherConnectionIsRefused(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	svc.SetDialer(func(sshx.Config, sshx.AuthMethod) error { return nil })
	created, err := svc.Create(ctx, Input{
		Name: "Prod", Host: "203.0.113.50", Port: 22, Username: "me",
		AuthType: AuthPassword, Password: "pw",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.store.ClearHostKey(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	pin := svc.pinHostKey(created.ID)
	// Two first connections that both saw an empty pin: the first to record wins and the second
	// must be refused, not accepted with a key that is not the pinned one.
	if err := pin("SHA256:winner"); err != nil {
		t.Fatalf("first connection: %v", err)
	}
	err = pin("SHA256:loser")
	if err == nil || !strings.Contains(err.Error(), "host key mismatch") {
		t.Fatalf("the losing connection must be refused, got %v", err)
	}
	if code, _ := sshx.ClassifyError(err); code != sshx.CodeHostKeyChanged {
		t.Fatalf("code %q", code)
	}
	if rec, _ := svc.store.Get(ctx, created.ID); rec.HostKey != "SHA256:winner" {
		t.Fatalf("pin changed: %q", rec.HostKey)
	}
	if err := pin("SHA256:winner"); err != nil {
		t.Fatalf("the pinned key stays accepted: %v", err)
	}
}

package servers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

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
	_, err = svc.Update(ctx, created.ID, Input{
		Name: "Lab", Host: "203.0.113.11", Port: 22, Username: "deploy",
		AuthType: AuthPassword, IconID: "cloud",
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

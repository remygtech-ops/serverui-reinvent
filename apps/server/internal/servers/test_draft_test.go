package servers

import (
	"context"
	"errors"
	"testing"

	sshx "serverui/server/internal/ssh"
)

// recordingDialer captures what TestDraft dialed with.
type recordingDialer struct {
	cfg  sshx.Config
	auth sshx.AuthMethod
	err  error
}

func (d *recordingDialer) dial(cfg sshx.Config, auth sshx.AuthMethod) error {
	d.cfg, d.auth = cfg, auth
	return d.err
}

func TestTestDraftSucceedsWithoutSaving(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	dialer := &recordingDialer{}
	svc.SetDialer(dialer.dial)

	result, err := svc.TestDraft(ctx, "", Input{
		Host: "203.0.113.10", Port: 2222, Username: "deploy",
		AuthType: AuthPassword, Password: "typed-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.OK || result.Code != "" || result.Error != "" {
		t.Fatalf("result = %+v", result)
	}
	if dialer.cfg.Port != 2222 || dialer.cfg.Username != "deploy" {
		t.Fatalf("dialed %+v", dialer.cfg)
	}
	if pw, ok := dialer.auth.(sshx.PasswordAuth); !ok || pw.Password != "typed-secret" {
		t.Fatalf("auth = %#v", dialer.auth)
	}
	items, _ := svc.List(ctx)
	if len(items) != 0 {
		t.Fatalf("draft test saved a server: %+v", items)
	}
}

func TestTestDraftDoesNotRequireName(t *testing.T) {
	svc := testService(t)
	result, err := svc.TestDraft(context.Background(), "", Input{
		Host: "203.0.113.10", Username: "deploy", AuthType: AuthPassword, Password: "x",
	})
	if err != nil || !result.OK {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestTestDraftReportsClassifiedFailure(t *testing.T) {
	svc := testService(t)
	svc.SetDialer(func(sshx.Config, sshx.AuthMethod) error {
		return errors.New("dial tcp 203.0.113.10:22: connect: connection refused")
	})
	result, err := svc.TestDraft(context.Background(), "", Input{
		Host: "203.0.113.10", Username: "deploy", AuthType: AuthPassword, Password: "x",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Code != sshx.CodeConnectionRefused || result.Error == "" {
		t.Fatalf("result = %+v", result)
	}
}

func TestTestDraftRejectsInvalidInput(t *testing.T) {
	svc := testService(t)
	cases := []Input{
		{Host: "", Username: "deploy", AuthType: AuthPassword, Password: "x"},
		{Host: "bad host", Username: "deploy", AuthType: AuthPassword, Password: "x"},
		{Host: "203.0.113.10", Port: 70000, Username: "deploy", AuthType: AuthPassword, Password: "x"},
		{Host: "203.0.113.10", Username: "", AuthType: AuthPassword, Password: "x"},
		{Host: "203.0.113.10", Username: "deploy", AuthType: AuthPassword},
	}
	for _, input := range cases {
		if _, err := svc.TestDraft(context.Background(), "", input); err == nil {
			t.Errorf("accepted %+v", input)
		}
	}
}

func TestTestDraftInvalidPrivateKey(t *testing.T) {
	svc := testService(t)
	result, err := svc.TestDraft(context.Background(), "", Input{
		Host: "203.0.113.10", Username: "deploy", AuthType: AuthPrivateKey, PrivateKey: "not a key",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Code != sshx.CodeInvalidPrivateKey {
		t.Fatalf("result = %+v", result)
	}
}

func TestTestDraftEditUsesSavedCredentialAndChangesNothing(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Production", Host: "203.0.113.10", Port: 22, Username: "deploy",
		AuthType: AuthPassword, Password: "saved-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := svc.store.Get(ctx, created.ID)
	credBefore, _ := svc.store.GetCredential(ctx, created.ID)

	dialer := &recordingDialer{err: errors.New("ssh: handshake failed: ssh: unable to authenticate")}
	svc.SetDialer(dialer.dial)

	// Same host, port and user, blank password: the saved password is used.
	result, err := svc.TestDraft(ctx, created.ID, Input{
		Host: "203.0.113.10", Port: 22, Username: "deploy", AuthType: AuthPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Code != sshx.CodeAuthFailed {
		t.Fatalf("result = %+v", result)
	}
	if dialer.cfg.Host != "203.0.113.10" || dialer.cfg.Username != "deploy" {
		t.Fatalf("dialed %+v", dialer.cfg)
	}
	if pw, ok := dialer.auth.(sshx.PasswordAuth); !ok || pw.Password != "saved-secret" {
		t.Fatalf("did not use the saved credential: %#v", dialer.auth)
	}

	after, _ := svc.store.Get(ctx, created.ID)
	credAfter, _ := svc.store.GetCredential(ctx, created.ID)
	if after != before {
		t.Fatalf("server record changed:\nbefore %+v\nafter  %+v", before, after)
	}
	if credAfter != credBefore {
		t.Fatal("credential changed")
	}
}

func TestTestDraftEditRequiresSecretWhenAuthTypeChanges(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Production", Host: "203.0.113.10", Username: "deploy",
		AuthType: AuthPassword, Password: "saved-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.TestDraft(ctx, created.ID, Input{
		Host: "203.0.113.10", Username: "deploy", AuthType: AuthPrivateKey,
	}); err == nil {
		t.Fatal("tested a new auth method without a key")
	}
}

func TestTestDraftUnknownServer(t *testing.T) {
	svc := testService(t)
	_, err := svc.TestDraft(context.Background(), "missing", Input{
		Host: "203.0.113.10", Username: "deploy", AuthType: AuthPassword,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestSavedCredentialIsNeverSentToAnotherDestination(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, Input{
		Name: "Production", Host: "203.0.113.10", Port: 22, Username: "deploy",
		AuthType: AuthPassword, Password: "saved-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	dialer := &recordingDialer{}
	svc.SetDialer(dialer.dial)

	for name, in := range map[string]Input{
		"host":     {Host: "198.51.100.7", Port: 22, Username: "deploy", AuthType: AuthPassword},
		"port":     {Host: "203.0.113.10", Port: 2222, Username: "deploy", AuthType: AuthPassword},
		"username": {Host: "203.0.113.10", Port: 22, Username: "root", AuthType: AuthPassword},
	} {
		result, err := svc.TestDraft(ctx, created.ID, in)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if result.OK || result.Code != CodeSecretRequiredForNewDestination {
			t.Fatalf("%s: result = %+v", name, result)
		}
		if dialer.cfg.Host != "" {
			t.Fatalf("%s: dialed %+v with a saved credential", name, dialer.cfg)
		}
	}

	// Updating the destination without a new secret is refused and nothing is dialed.
	if _, err := svc.Update(ctx, created.ID, Input{
		Name: "Production", Host: "198.51.100.7", Port: 22, Username: "deploy", AuthType: AuthPassword,
	}); err == nil {
		t.Fatal("changing the host without a new secret must be refused")
	}
	if dialer.cfg.Host != "" {
		t.Fatalf("update dialed %+v with the saved credential", dialer.cfg)
	}
	// A new secret for the new destination is fine.
	if _, err := svc.Update(ctx, created.ID, Input{
		Name: "Production", Host: "198.51.100.7", Port: 22, Username: "deploy", AuthType: AuthPassword, Password: "new-secret",
	}); err != nil {
		t.Fatalf("new host with a new secret: %v", err)
	}
}

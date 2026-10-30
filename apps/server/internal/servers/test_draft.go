package servers

import (
	"context"
	"log"
	"strings"
	"time"

	sshx "serverui/server/internal/ssh"
)

// CodeSavedCredentialUnavailable means the saved secret could not be decrypted.
const CodeSavedCredentialUnavailable = "saved_credential_unavailable"

// CodeSecretRequiredForNewDestination means the host, port or username changed, so the saved
// secret must not be reused and a new one has to be entered.
const CodeSecretRequiredForNewDestination = "secret_required_for_new_destination"

type DraftTestResult struct {
	OK      bool   `json:"ok"`
	Latency int64  `json:"latencyMs"`
	Code    string `json:"code,omitempty"`
	Error   string `json:"error,omitempty"`
}

// TestDraft tests form details without saving; a blank secret reuses the saved one.
func (s *Service) TestDraft(ctx context.Context, serverID string, input Input) (DraftTestResult, error) {
	input = Normalize(input)
	var saved Record
	useSaved := false
	pinned := ""
	if serverID != "" {
		var err error
		if saved, err = s.store.Get(ctx, serverID); err != nil {
			return DraftTestResult{}, err
		}
		blank := input.Password == "" && input.PrivateKey == ""
		if blank && input.AuthType == saved.AuthType && !sameDestination(saved, input) {
			// A saved credential is only ever presented to the host it was saved for.
			return DraftTestResult{
				Code:  CodeSecretRequiredForNewDestination,
				Error: "Enter the password or private key again to test a different host, port or username.",
			}, nil
		}
		useSaved = blank && input.AuthType == saved.AuthType
		if sameDestination(saved, input) {
			pinned = saved.HostKey // a test of the saved destination also checks the pinned key
		}
	}
	if err := ValidateConnection(input, !useSaved); err != nil {
		return DraftTestResult{}, err
	}

	var auth sshx.AuthMethod
	var err error
	if useSaved {
		if auth, err = s.savedAuth(ctx, saved); err != nil {
			return DraftTestResult{
				Code:  CodeSavedCredentialUnavailable,
				Error: "The saved credential could not be read. Enter the password or private key again.",
			}, nil
		}
	} else if auth, err = authMethod(input.AuthType, input.secretValue()); err != nil {
		return failedDraft(err, 0), nil
	}

	cfg := sshx.Config{Host: input.Host, Port: input.Port, Username: input.Username, PinnedHostKey: pinned}
	log.Printf("server.test_draft host=%s port=%d saved_credential=%t", cfg.Host, cfg.Port, useSaved)
	start := time.Now()
	err = s.dial(cfg, auth)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return failedDraft(err, latency), nil
	}
	return DraftTestResult{OK: true, Latency: latency}, nil
}

func (in Input) secretValue() string {
	if in.AuthType == AuthPrivateKey {
		return packKey(in.PrivateKey, in.Passphrase)
	}
	return in.Password
}

func failedDraft(err error, latency int64) DraftTestResult {
	code, message := sshx.ClassifyError(err)
	return DraftTestResult{OK: false, Latency: latency, Code: code, Error: message}
}

// sameDestination reports whether the request targets the host, port and user the secret was saved for.
func sameDestination(saved Record, input Input) bool {
	return strings.EqualFold(saved.Host, input.Host) && saved.Port == input.Port && saved.Username == input.Username
}

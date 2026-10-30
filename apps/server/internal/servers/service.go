package servers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"serverui/server/internal/crypto"
	sshx "serverui/server/internal/ssh"
)

type Dialer func(cfg sshx.Config, auth sshx.AuthMethod) error

type Service struct {
	store   Store
	box     crypto.Cipher
	pool    *sshx.Pool
	dial    Dialer
	iconDir string

	// sessionSecrets holds secrets of servers saved without credentials. Memory only.
	secretMu       sync.Mutex
	sessionSecrets map[string]string
}

type TestResult struct {
	OK      bool   `json:"ok"`
	Latency int64  `json:"latencyMs"`
	Error   string `json:"error,omitempty"`
	Server  Public `json:"server"`
}

func NewService(store Store, box crypto.Cipher) *Service {
	s := &Service{
		store: store,
		box:   box,
		dial:  liveDial,

		sessionSecrets: map[string]string{},
	}
	s.pool = sshx.NewPool(s.loadAuth)
	return s
}

func (s *Service) Pool() *sshx.Pool {
	return s.pool
}

func (s *Service) SetIconDir(dir string) {
	s.iconDir = dir
}

func (s *Service) SetDialer(dial Dialer) {
	if dial == nil {
		s.dial = liveDial
		return
	}
	s.dial = dial
}

func liveDial(cfg sshx.Config, auth sshx.AuthMethod) error {
	client, err := sshx.Dial(cfg, auth)
	if err != nil {
		return err
	}
	return client.Close()
}

func (s *Service) List(ctx context.Context) ([]Public, error) {
	recs, err := s.store.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Public, 0, len(recs))
	for _, rec := range recs {
		out = append(out, s.public(rec))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id string) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	return s.public(rec), nil
}

func (s *Service) Create(ctx context.Context, input Input) (Public, error) {
	input = Normalize(input)
	if err := Validate(input, true); err != nil {
		return Public{}, err
	}
	secret, err := s.secret(input, true)
	if err != nil {
		return Public{}, err
	}
	stored := secret
	if !input.saveCredentials() {
		stored = ""
	}
	encrypted, err := s.box.Encrypt(stored)
	if err != nil {
		return Public{}, fmt.Errorf("unable to store credentials")
	}

	now := time.Now().UTC()
	id := newID()
	customIcon, err := s.applyIconImage(id, "", input.IconImage)
	if err != nil {
		return Public{}, err
	}
	rec := Record{
		ID:         id,
		Name:       input.Name,
		Host:       input.Host,
		Port:       input.Port,
		Username:   input.Username,
		AuthType:   input.AuthType,
		IconID:     input.IconID,
		CustomIcon: customIcon,
		Status:     StatusUnknown,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	cred := Credential{
		ID:              newID(),
		ServerID:        rec.ID,
		AuthType:        rec.AuthType,
		EncryptedSecret: encrypted,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.store.Create(ctx, rec, cred); err != nil {
		s.removeIconFiles(id)
		return Public{}, err
	}
	log.Printf("server.created id=%s name=%s host=%s", rec.ID, rec.Name, rec.Host)

	if !input.saveCredentials() {
		s.setSessionSecret(rec.ID, secret)
	}
	rec, _ = s.testAndUpdate(ctx, rec, secret)
	return s.public(rec), nil
}

func (s *Service) Update(ctx context.Context, id string, input Input) (Public, error) {
	input = Normalize(input)
	existing, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	requireSecret := input.Password != "" || input.PrivateKey != "" || input.AuthType != existing.AuthType ||
		!sameDestination(existing, input)
	if err := Validate(input, requireSecret); err != nil {
		return Public{}, err
	}

	reconnect := affectsConnection(existing, input, requireSecret)
	existing.Name = input.Name
	existing.Host = input.Host
	existing.Port = input.Port
	existing.Username = input.Username
	existing.AuthType = input.AuthType
	existing.IconID = input.IconID
	existing.UpdatedAt = time.Now().UTC()
	if reconnect {
		existing.LastError = ""
		existing.Status = StatusUnknown
	}

	// Switching "save password" off drops the stored secret; switching it on needs a new one.
	wasSaved := s.secretSaved(existing.ID)
	if input.SaveCredentials != nil && *input.SaveCredentials && !wasSaved && !requireSecret {
		return Public{}, fmt.Errorf("enter the password or private key to save it")
	}
	dropSecret := input.SaveCredentials != nil && !*input.SaveCredentials && wasSaved
	if dropSecret && !requireSecret {
		// Keep using the stored secret for this session, then forget it on disk.
		if cred, err := s.store.GetCredential(ctx, existing.ID); err == nil {
			if plain, err := s.box.Decrypt(cred.EncryptedSecret); err == nil {
				s.setSessionSecret(existing.ID, plain)
			}
		}
	}
	if requireSecret || dropSecret {
		secret := ""
		if requireSecret {
			var err error
			secret, err = s.secret(input, true)
			if err != nil {
				return Public{}, err
			}
		}
		stored := secret
		if !input.saveCredentials() {
			stored = ""
			if secret != "" {
				s.setSessionSecret(existing.ID, secret)
			}
		}
		encrypted, err := s.box.Encrypt(stored)
		if err != nil {
			return Public{}, fmt.Errorf("unable to store credentials")
		}
		now := time.Now().UTC()
		if err := s.store.UpsertCredential(ctx, Credential{
			ID:              newID(),
			ServerID:        existing.ID,
			AuthType:        existing.AuthType,
			EncryptedSecret: encrypted,
			CreatedAt:       now,
			UpdatedAt:       now,
		}); err != nil {
			return Public{}, err
		}
	}

	customIcon, err := s.applyIconImage(existing.ID, existing.CustomIcon, input.IconImage)
	if err != nil {
		return Public{}, err
	}
	existing.CustomIcon = customIcon
	if reconnect {
		s.pool.Forget(existing.ID)
	}
	if err := s.store.Update(ctx, existing); err != nil {
		return Public{}, err
	}
	if requireSecret {
		// A new destination, or a secret entered again on purpose, is how the operator accepts a
		// different host key: forget the old one so the next connection pins the current key.
		if err := s.store.ClearHostKey(ctx, existing.ID); err != nil {
			return Public{}, err
		}
		existing.HostKey = ""
		// A Manager created while the old pin was still set would fail closed for the new host.
		s.pool.Forget(existing.ID)
	}
	log.Printf("server.updated id=%s name=%s", existing.ID, existing.Name)
	if reconnect {
		existing, _ = s.testAndUpdate(ctx, existing, "")
	}
	return s.public(existing), nil
}

func affectsConnection(existing Record, input Input, secretChanged bool) bool {
	return secretChanged ||
		existing.Host != input.Host ||
		existing.Port != input.Port ||
		existing.Username != input.Username ||
		existing.AuthType != input.AuthType
}

func (s *Service) OpenIcon(ctx context.Context, id string) ([]byte, string, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return nil, "", err
	}
	if rec.CustomIcon == "" {
		return nil, "", fmt.Errorf("server icon not found")
	}
	return s.ReadIcon(id, rec.CustomIcon)
}

func (s *Service) applyIconImage(id, current string, image *string) (string, error) {
	if image == nil {
		return current, nil
	}
	if strings.TrimSpace(*image) == "" {
		s.removeIconFiles(id)
		return "", nil
	}
	return s.saveIcon(id, *image)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return err
	}
	s.pool.Forget(id)
	s.clearSessionSecret(id)
	if err := s.store.Delete(ctx, id); err != nil {
		return err
	}
	s.removeIconFiles(id)
	log.Printf("server.deleted id=%s name=%s", rec.ID, rec.Name)
	return nil
}

// Connect opens the pooled SSH session. supplied carries the password/key for servers saved
// without credentials; it is validated, kept in memory only and never written to disk.
func (s *Service) Connect(ctx context.Context, id string, supplied *Secret) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	if supplied != nil {
		secret, err := s.suppliedSecret(rec.AuthType, *supplied)
		if err != nil {
			return s.public(rec), err
		}
		s.setSessionSecret(rec.ID, secret)
	}
	log.Printf("SSH connection requested server=%s", rec.Name)
	rec.Status = StatusConnecting
	rec.LastError = ""
	rec.UpdatedAt = time.Now().UTC()
	_ = s.store.Update(ctx, rec)

	_, err = s.pool.Ensure(id)
	if err != nil {
		if errors.Is(err, ErrSecretRequired) {
			rec.Status = StatusOffline
			rec.LastError = ""
			rec.UpdatedAt = time.Now().UTC()
			_ = s.store.Update(ctx, rec)
			return s.public(rec), err
		}
		if supplied != nil {
			s.clearSessionSecret(rec.ID)
		}
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		log.Printf("SSH connection failed server=%s", rec.Name)
		return s.public(rec), err
	}

	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	log.Printf("SSH connection established server=%s", rec.Name)
	return s.public(rec), nil
}

func (s *Service) Disconnect(ctx context.Context, id string) (Public, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return Public{}, err
	}
	if err := s.pool.Disconnect(id); err != nil {
		log.Printf("SSH connection close error server=%s", rec.Name)
	} else {
		log.Printf("SSH connection closed server=%s", rec.Name)
	}
	rec.Status = StatusOffline
	rec.UpdatedAt = time.Now().UTC()
	_ = s.store.Update(ctx, rec)
	log.Printf("server.disconnected id=%s name=%s", rec.ID, rec.Name)
	return s.public(rec), nil
}

func (s *Service) Test(ctx context.Context, id string) (TestResult, error) {
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return TestResult{}, err
	}
	log.Printf("SSH connection test requested server=%s", rec.Name)
	start := time.Now()
	cfg, auth, err := s.loadAuth(id)
	if err != nil {
		return TestResult{Server: s.public(rec), Error: sshx.PublicError(err)}, err
	}
	err = s.dial(cfg, auth)
	latency := time.Since(start)
	if err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		log.Printf("Server connection test failed server=%s", rec.Name)
		return TestResult{
			OK:      false,
			Latency: latency.Milliseconds(),
			Error:   rec.LastError,
			Server:  s.public(rec),
		}, nil
	}
	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	log.Printf("SSH connection test succeeded server=%s", rec.Name)
	return TestResult{
		OK:      true,
		Latency: latency.Milliseconds(),
		Server:  s.public(rec),
	}, nil
}

// currentHostKey reads the pinned key fresh, so a pooled connection that reconnects later
// enforces a pin recorded after it was created.
func (s *Service) currentHostKey(id string) func() string {
	return func() string {
		rec, err := s.store.Get(context.Background(), id)
		if err != nil {
			return ""
		}
		return rec.HostKey
	}
}

// pinHostKey returns the first-use callback that stores a server's host key fingerprint. When
// another connection pinned a different key first, this one is refused instead of accepted.
func (s *Service) pinHostKey(id string) func(string) error {
	return func(fingerprint string) error {
		pinned, err := s.store.SetHostKey(context.Background(), id, fingerprint)
		if err != nil {
			log.Printf("server.hostkey id=%s pin failed", id)
			return fmt.Errorf("unable to record the SSH host key")
		}
		if pinned != fingerprint {
			return fmt.Errorf("host key mismatch: the server presented %s but %s was trusted", fingerprint, pinned)
		}
		log.Printf("server.hostkey id=%s pinned", id)
		return nil
	}
}

func (s *Service) loadAuth(id string) (sshx.Config, sshx.AuthMethod, error) {
	ctx := context.Background()
	rec, err := s.store.Get(ctx, id)
	if err != nil {
		return sshx.Config{}, nil, err
	}
	auth, err := s.savedAuth(ctx, rec)
	if err != nil {
		return sshx.Config{}, nil, err
	}
	cfg := sshx.Config{
		Host:          rec.Host,
		Port:          rec.Port,
		Username:      rec.Username,
		PinnedHostKey: rec.HostKey,
		PinLookup:     s.currentHostKey(rec.ID),
		OnHostKey:     s.pinHostKey(rec.ID),
	}
	return cfg, auth, nil
}

// savedAuth loads and decrypts the stored credential for rec.
func (s *Service) savedAuth(ctx context.Context, rec Record) (sshx.AuthMethod, error) {
	cred, err := s.store.GetCredential(ctx, rec.ID)
	if err != nil {
		return nil, fmt.Errorf("unable to authenticate")
	}
	secret, err := s.box.Decrypt(cred.EncryptedSecret)
	if err != nil {
		return nil, fmt.Errorf("unable to authenticate")
	}
	if secret == "" {
		// Saved without credentials: only a secret entered this session can be used.
		session, ok := s.sessionSecret(rec.ID)
		if !ok {
			return nil, ErrSecretRequired
		}
		secret = session
	}
	return authMethod(rec.AuthType, secret)
}

// secretSaved reports whether a password/key is stored (encrypted) for the server.
func (s *Service) secretSaved(id string) bool {
	cred, err := s.store.GetCredential(context.Background(), id)
	if err != nil {
		return false
	}
	secret, err := s.box.Decrypt(cred.EncryptedSecret)
	return err == nil && secret != ""
}

func (s *Service) suppliedSecret(authType string, supplied Secret) (string, error) {
	switch authType {
	case AuthPassword:
		if strings.TrimSpace(supplied.Password) == "" {
			return "", fmt.Errorf("password is required")
		}
		return strings.TrimSpace(supplied.Password), nil
	case AuthPrivateKey:
		key := strings.TrimSpace(supplied.PrivateKey)
		if key == "" {
			return "", fmt.Errorf("private key is required")
		}
		if _, err := sshx.ParsePrivateKeyAuth(key, supplied.Passphrase); err != nil {
			return "", err
		}
		return packKey(key, supplied.Passphrase), nil
	default:
		return "", fmt.Errorf("invalid authentication type")
	}
}

func (s *Service) setSessionSecret(id, secret string) {
	s.secretMu.Lock()
	defer s.secretMu.Unlock()
	s.sessionSecrets[id] = secret
}

func (s *Service) sessionSecret(id string) (string, bool) {
	s.secretMu.Lock()
	defer s.secretMu.Unlock()
	secret, ok := s.sessionSecrets[id]
	return secret, ok && secret != ""
}

func (s *Service) clearSessionSecret(id string) {
	s.secretMu.Lock()
	defer s.secretMu.Unlock()
	delete(s.sessionSecrets, id)
}

func (s *Service) secret(input Input, required bool) (string, error) {
	switch input.AuthType {
	case AuthPassword:
		if required && input.Password == "" {
			return "", fmt.Errorf("password is required")
		}
		return input.Password, nil
	case AuthPrivateKey:
		if required && input.PrivateKey == "" {
			return "", fmt.Errorf("private key is required")
		}
		if _, err := sshx.ParsePrivateKeyAuth(input.PrivateKey, input.Passphrase); err != nil {
			return "", err
		}
		return packKey(input.PrivateKey, input.Passphrase), nil
	default:
		return "", fmt.Errorf("invalid authentication type")
	}
}

func (s *Service) testAndUpdate(ctx context.Context, rec Record, secret string) (Record, error) {
	cfg := sshx.Config{Host: rec.Host, Port: rec.Port, Username: rec.Username, PinnedHostKey: rec.HostKey, OnHostKey: s.pinHostKey(rec.ID)}
	var auth sshx.AuthMethod
	var err error
	if secret != "" {
		auth, err = authMethod(rec.AuthType, secret)
	} else {
		cfg, auth, err = s.loadAuth(rec.ID)
	}
	if err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		return rec, err
	}
	if err := s.dial(cfg, auth); err != nil {
		rec.Status = statusFromErr(err)
		rec.LastError = sshx.PublicError(err)
		rec.UpdatedAt = time.Now().UTC()
		_ = s.store.Update(ctx, rec)
		return rec, err
	}
	now := time.Now().UTC()
	rec.Status = StatusOnline
	rec.LastError = ""
	rec.LastSeen = &now
	rec.UpdatedAt = now
	_ = s.store.Update(ctx, rec)
	return rec, nil
}

func (s *Service) public(rec Record) Public {
	live := s.pool != nil && s.pool.IsConnected(rec.ID)
	if live {
		rec.Status = StatusOnline
		rec.LastError = ""
	}
	out := rec.Public()
	// Connected means a live pooled SSH session, not a previous successful test.
	out.Connected = live
	out.CredentialsSaved = s.secretSaved(rec.ID)
	return out
}

func authMethod(authType, secret string) (sshx.AuthMethod, error) {
	switch authType {
	case AuthPassword:
		return sshx.PasswordAuth{Password: secret}, nil
	case AuthPrivateKey:
		key, passphrase := unpackKey(secret)
		return sshx.ParsePrivateKeyAuth(key, passphrase)
	default:
		return nil, fmt.Errorf("invalid authentication type")
	}
}

func statusFromErr(err error) string {
	if err == nil {
		return StatusOnline
	}
	if code, _ := sshx.ClassifyError(err); code == sshx.CodeAuthFailed {
		return StatusAuthenticationFailed
	}
	return StatusOffline
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

package sshx

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Host     string
	Port     int
	Username string
	Password string

	// PinnedHostKey is the SHA256 fingerprint trusted for this host. When set, any other host key
	// is refused. When empty the first key seen is reported to OnHostKey (trust on first use).
	PinnedHostKey string
	// PinLookup, when set, is read on every dial so a long-lived Manager always enforces the
	// current pin, including one recorded after the Manager was created.
	PinLookup func() string
	OnHostKey func(fingerprint string)
}

// LoadConfig reads a single-host SSH target from process environment.
// Production ServerUI does not use this path: hosts and credentials come from
// the servers store and are dialed through Pool/Manager. Kept for tests and
// local experiments only. Never log SERVER_PASSWORD.
func LoadConfig() Config {
	return Config{
		Host:     envOr("SERVER_HOST", "203.0.113.10"),
		Port:     envInt("SERVER_PORT", 22),
		Username: envOr("SERVER_USER", "deploy"),
		Password: os.Getenv("SERVER_PASSWORD"),
	}
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

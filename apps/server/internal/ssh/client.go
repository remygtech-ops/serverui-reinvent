package sshx

import (
	"crypto/subtle"
	"fmt"
	"net"
	"time"

	"golang.org/x/crypto/ssh"
)

func Dial(cfg Config, auth AuthMethod) (*ssh.Client, error) {
	if cfg.Host == "" || cfg.Username == "" {
		return nil, fmt.Errorf("ssh host and username are required")
	}
	if auth == nil {
		return nil, fmt.Errorf("ssh auth method is required")
	}
	if password, ok := auth.(PasswordAuth); ok && password.Password == "" {
		return nil, fmt.Errorf("unable to authenticate")
	}

	config := &ssh.ClientConfig{
		User: cfg.Username,
		Auth: []ssh.AuthMethod{auth.SSHAuthMethod()},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			fingerprint := ssh.FingerprintSHA256(key)
			if cfg.PinnedHostKey == "" {
				// First use: trust and report the key so the caller can pin it.
				if cfg.OnHostKey != nil {
					cfg.OnHostKey(fingerprint)
				}
				return nil
			}
			if subtle.ConstantTimeCompare([]byte(fingerprint), []byte(cfg.PinnedHostKey)) != 1 {
				return fmt.Errorf("host key mismatch: the server presented %s but %s was trusted", fingerprint, cfg.PinnedHostKey)
			}
			return nil
		},
		Timeout: 12 * time.Second,
	}

	return ssh.Dial("tcp", cfg.Addr(), config)
}

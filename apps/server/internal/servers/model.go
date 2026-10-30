package servers

import (
	"errors"
	"time"
)

const (
	AuthPassword   = "password"
	AuthPrivateKey = "private_key"

	StatusOnline               = "online"
	StatusOffline              = "offline"
	StatusConnecting           = "connecting"
	StatusAuthenticationFailed = "authentication_failed"
	StatusUnknown              = "unknown"
)

type Record struct {
	ID         string
	Name       string
	Host       string
	Port       int
	Username   string
	AuthType   string
	Status     string
	LastError  string
	IconID     string
	CustomIcon string
	// HostKey is the pinned SSH host key fingerprint (SHA256). Empty until the first connection.
	HostKey   string
	LastSeen  *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Credential struct {
	ID              string
	ServerID        string
	AuthType        string
	EncryptedSecret string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Input struct {
	Name       string
	Host       string
	Port       int
	Username   string
	AuthType   string
	Password   string
	PrivateKey string
	// Passphrase unlocks an encrypted private key. Optional.
	Passphrase string
	IconID     string
	// SaveCredentials controls whether the password/key is stored (encrypted). Nil means yes.
	// When false the secret is only kept in memory for the running session.
	SaveCredentials *bool
	// IconImage is a data URL to store as a file, empty to remove one, or nil to leave it.
	IconImage *string
}

type Public struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"authType"`
	IconID     string `json:"iconId"`
	CustomIcon bool   `json:"customIcon"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	Connected  bool   `json:"connected"`
	// CredentialsSaved is false when the password/key was not stored and must be entered to connect.
	CredentialsSaved bool       `json:"credentialsSaved"`
	LastSeen         *time.Time `json:"lastSeen,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

func (r Record) Public() Public {
	return Public{
		ID:         r.ID,
		Name:       r.Name,
		Host:       r.Host,
		Port:       r.Port,
		Username:   r.Username,
		AuthType:   r.AuthType,
		IconID:     iconIDOrDefault(r.IconID),
		CustomIcon: r.CustomIcon != "",
		Status:     r.Status,
		Error:      r.LastError,
		LastSeen:   r.LastSeen,
		CreatedAt:  r.CreatedAt,
		UpdatedAt:  r.UpdatedAt,
	}
}

// ErrSecretRequired means the server has no stored password/key and none was supplied this session.
var ErrSecretRequired = errors.New("secret required")

// saveCredentials reports whether the secret should be stored, defaulting to true.
func (i Input) saveCredentials() bool {
	return i.SaveCredentials == nil || *i.SaveCredentials
}

// Secret is a password or private key supplied at connect time for a server that does not store one.
type Secret struct {
	Password   string
	PrivateKey string
	Passphrase string
}

package servers

import (
	"encoding/json"
	"strings"
)

// A private key and its passphrase are stored as one encrypted secret. Keys without a
// passphrase keep the plain PEM form, so everything stored before stays readable.
const packedKeyPrefix = `{"key":`

type packedKey struct {
	Key        string `json:"key"`
	Passphrase string `json:"passphrase"`
}

func packKey(key, passphrase string) string {
	if passphrase == "" {
		return key
	}
	raw, err := json.Marshal(packedKey{Key: key, Passphrase: passphrase})
	if err != nil {
		return key
	}
	return string(raw)
}

func unpackKey(secret string) (key, passphrase string) {
	if !strings.HasPrefix(secret, packedKeyPrefix) {
		return secret, ""
	}
	var packed packedKey
	if err := json.Unmarshal([]byte(secret), &packed); err != nil || packed.Key == "" {
		return secret, ""
	}
	return packed.Key, packed.Passphrase
}

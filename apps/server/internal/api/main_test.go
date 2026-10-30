package api

import (
	"os"
	"testing"
)

// httptest requests use Host "example.com"; tests that exercise the host rules override this.
func TestMain(m *testing.M) {
	_ = os.Setenv("SERVERUI_ALLOWED_HOSTS", "example.com")
	os.Exit(m.Run())
}

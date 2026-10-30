package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestListenAddrDefault(t *testing.T) {
	t.Setenv("HTTP_PORT", "")
	t.Setenv("SERVERUI_LISTEN_HOST", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "")
	if ListenAddr() != ":8080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrLoopback(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_LISTEN_HOST", "127.0.0.1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	if ListenAddr() != "127.0.0.1:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrDesktopForcesLoopback(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "tok")
	t.Setenv("SERVERUI_LISTEN_HOST", "0.0.0.0")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "")
	if ListenAddr() != "127.0.0.1:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrDesktopOverrideRequiresExplicitFlag(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "tok")
	t.Setenv("SERVERUI_LISTEN_HOST", "0.0.0.0")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "1")
	if ListenAddr() != "0.0.0.0:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestLocalAuthRejectsIconWithoutToken(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/api/servers/abc/icon", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthRejectsMissingToken(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthRejectsAuthorizationBearer(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Authorization", "Bearer test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthAcceptsHeader(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set(LocalAuthHeader, "test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestLocalAuthQueryTokenOnlyForMediaRoutes(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	for _, path := range []string{"/api/files/download?localToken=test-local-token-value", "/api/servers/abc/icon?localToken=test-local-token-value"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if requestLocalToken(req) != "test-local-token-value" {
			t.Fatalf("%s should accept the query token", path)
		}
	}
	for _, path := range []string{"/healthz?localToken=test-local-token-value", "/api/servers?localToken=test-local-token-value", "/ws/terminal?localToken=test-local-token-value"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if requestLocalToken(req) != "" {
			t.Fatalf("%s must not accept the query token", path)
		}
	}
	post := httptest.NewRequest(http.MethodPost, "/api/files/download?localToken=test-local-token-value", nil)
	if requestLocalToken(post) != "" {
		t.Fatal("only GET/HEAD may use the query token")
	}
	// The generic route is rejected end to end.
	handler := (&Server{}).Handler()
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz?localToken=test-local-token-value", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthDisabledWhenUnset(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthAllowsOptionsWithoutToken(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/api/servers", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestDesktopCORSRejectsForeignOrigin(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/api/servers", nil)
	req.Header.Set("Origin", "https://evil.example.test")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("should not reflect foreign origin")
	}
}

func TestDesktopCORSAllowsLocalhost(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set(LocalAuthHeader, "test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("cors %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestParseByteRange(t *testing.T) {
	start, end, ok := parseByteRange("bytes=0-99", 1000)
	if !ok || start != 0 || end != 99 {
		t.Fatalf("got %d %d %v", start, end, ok)
	}
	start, end, ok = parseByteRange("bytes=100-", 250)
	if !ok || start != 100 || end != 249 {
		t.Fatalf("suffix open range: %d %d %v", start, end, ok)
	}
	if _, _, ok := parseByteRange("bytes=500-10", 100); ok {
		t.Fatal("invalid range should fail")
	}
}

func TestCORSPreflight(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_ALLOWED_ORIGINS", "")
	handler := (&Server{}).Handler()
	// The web UI (:3000) and the API (:8080) share a host name, so the UI origin is accepted.
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Host = "localhost:8080"
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("cors %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestWebModeRejectsForeignOrigins(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_ALLOWED_ORIGINS", "")
	handler := (&Server{}).Handler()
	for _, method := range []string{http.MethodOptions, http.MethodGet, http.MethodPost} {
		req := httptest.NewRequest(method, "/healthz", nil)
		req.Host = "localhost:8080"
		req.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s from a foreign origin: status %d", method, rec.Code)
		}
		if rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("%s: foreign origin was reflected", method)
		}
	}
	// A WebSocket upgrade is a GET with an Origin; it is refused before the handler runs.
	ws := httptest.NewRequest(http.MethodGet, "/ws/terminal?serverId=x", nil)
	ws.Host = "localhost:8080"
	ws.Header.Set("Origin", "https://evil.example")
	ws.Header.Set("Connection", "Upgrade")
	ws.Header.Set("Upgrade", "websocket")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, ws)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("websocket from a foreign origin: status %d", rec.Code)
	}
	// Requests without an Origin (curl, the desktop shell health check) are unaffected.
	plain := httptest.NewRecorder()
	handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if plain.Code != http.StatusOK {
		t.Fatalf("no-origin request: status %d", plain.Code)
	}
}

func TestWebModeOriginRules(t *testing.T) {
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_ALLOWED_ORIGINS", "https://panel.example.test")
	mk := func(host, origin, xfh string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		r.Host = host
		r.Header.Set("Origin", origin)
		if xfh != "" {
			r.Header.Set("X-Forwarded-Host", xfh)
		}
		return r
	}
	cases := []struct {
		name string
		req  *http.Request
		want bool
	}{
		{"same host other port", mk("10.0.0.5:8080", "http://10.0.0.5:3000", ""), true},
		{"ipv6 host", mk("[::1]:8080", "http://[::1]:3000", ""), true},
		{"through the Next proxy", mk("server:8080", "https://ui.example.test", "ui.example.test"), true},
		{"listed origin", mk("server:8080", "https://panel.example.test", ""), true},
		{"foreign origin", mk("localhost:8080", "https://evil.example", ""), false},
		{"null origin", mk("localhost:8080", "null", ""), false},
		{"forwarded host of another site", mk("server:8080", "https://evil.example", "ui.example.test"), false},
		{"no origin", httptest.NewRequest(http.MethodGet, "/healthz", nil), true},
	}
	for _, c := range cases {
		if got := requestOriginAllowed(c.req); got != c.want {
			t.Fatalf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestOriginAllowedHelpers(t *testing.T) {
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "x")
	if !originAllowed("tauri://localhost") {
		t.Fatal("tauri origin")
	}
	if originAllowed("https://evil.example.test") {
		t.Fatal("foreign origin")
	}
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	if originAllowed("https://app.example.test") {
		t.Fatal("the desktop allowlist must not apply to web mode")
	}
}

func TestJSONBodiesNeedAJSONContentType(t *testing.T) {
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	handler := (&Server{}).Handler()
	for _, ct := range []string{"text/plain", "application/x-www-form-urlencoded", ""} {
		req := httptest.NewRequest(http.MethodPost, "/api/servers", strings.NewReader(`{"name":"x"}`))
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("content type %q: status %d", ct, rec.Code)
		}
	}
}

func TestDesktopModeRequiresAToken(t *testing.T) {
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	if ValidateAuthConfig() == nil {
		t.Fatal("desktop mode without a token must fail closed")
	}
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "x")
	if err := ValidateAuthConfig(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	if err := ValidateAuthConfig(); err != nil {
		t.Fatal(err)
	}
}

func TestSelectedWebSocketProtocol(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ws/terminal", nil)
	req.Header.Set("Sec-WebSocket-Protocol", "chat, "+LocalAuthWSProtocolPrefix+"abc")
	got := SelectedWebSocketProtocol(req)
	if !strings.HasPrefix(got, LocalAuthWSProtocolPrefix) {
		t.Fatalf("got %q", got)
	}
}

package api

import (
	"crypto/subtle"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// LocalAuthHeader is required on desktop when SERVERUI_LOCAL_AUTH_TOKEN is set.
const LocalAuthHeader = "X-ServerUI-Local-Token"

// LocalAuthQuery is accepted only where custom headers cannot be sent
// (media/download URLs). Prefer LocalAuthHeader for HTTP and the
// Sec-WebSocket-Protocol subprotocol for WebSockets.
const LocalAuthQuery = "localToken"

// LocalAuthWSProtocolPrefix is preferred for WebSocket auth so the token
// is not placed in the request URL (access logs, browser history).
const LocalAuthWSProtocolPrefix = "serverui-local."

// DesktopMode reports whether this process is running as a desktop-local API.
// Triggered by an explicit SERVERUI_DESKTOP=1 flag or a non-empty local auth token
// (Tauri always sets both).
func DesktopMode() bool {
	if truthy(os.Getenv("SERVERUI_DESKTOP")) {
		return true
	}
	return localAuthToken() != ""
}

func localAuthToken() string {
	return strings.TrimSpace(os.Getenv("SERVERUI_LOCAL_AUTH_TOKEN"))
}

func allowNonLoopback() bool {
	return truthy(os.Getenv("SERVERUI_ALLOW_NON_LOOPBACK"))
}

func truthy(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func requestLocalToken(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get(LocalAuthHeader)); v != "" {
		return v
	}
	if v := websocketLocalToken(r); v != "" {
		return v
	}
	if !localTokenQueryAllowed(r) {
		return ""
	}
	return strings.TrimSpace(r.URL.Query().Get(LocalAuthQuery))
}

// localTokenQueryAllowed limits the query-string token to media and download URLs, which an
// <img>, <video> or download link cannot send a header for. Query strings end up in logs.
func localTokenQueryAllowed(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	p := r.URL.Path
	return p == "/api/files/download" || (strings.HasPrefix(p, "/api/servers/") && strings.HasSuffix(p, "/icon"))
}

func websocketLocalToken(r *http.Request) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(p, LocalAuthWSProtocolPrefix) {
			return strings.TrimPrefix(p, LocalAuthWSProtocolPrefix)
		}
	}
	return ""
}

func tokenMatches(got, expected string) bool {
	if expected == "" {
		return true
	}
	if got == "" {
		return false
	}
	if len(got) != len(expected) {
		// Still compare equal-length buffers to keep timing flatter.
		dummy := make([]byte, len(expected))
		_ = subtle.ConstantTimeCompare(dummy, []byte(expected))
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(expected)) == 1
}

// ListenAddr returns the HTTP bind address.
//
// WEB / Docker: unset SERVERUI_LISTEN_HOST → ":PORT" (all interfaces).
// DESKTOP: forced to 127.0.0.1 unless SERVERUI_ALLOW_NON_LOOPBACK=1
// (developer-only escape hatch; never used by Tauri).
func ListenAddr() string {
	port := strings.TrimSpace(os.Getenv("HTTP_PORT"))
	if port == "" {
		port = "8080"
	}
	host := strings.TrimSpace(os.Getenv("SERVERUI_LISTEN_HOST"))

	if DesktopMode() && !allowNonLoopback() {
		if host == "" || !isLoopbackHost(host) {
			host = "127.0.0.1"
		}
	}
	if host == "" {
		return ":" + port
	}
	return net.JoinHostPort(host, port)
}

func isLoopbackHost(host string) bool {
	h := strings.TrimSpace(strings.ToLower(host))
	if h == "127.0.0.1" || h == "localhost" || h == "::1" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// requestOriginAllowed enforces the browser Origin on every request. Non-browser clients send no
// Origin and pass. Web mode only accepts an Origin on the same host as the request (any port, so
// the web UI on :3000 can reach the API on :8080) or one listed in SERVERUI_ALLOWED_ORIGINS.
func requestOriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	if DesktopMode() {
		return originAllowed(origin)
	}
	for _, allowed := range strings.Split(os.Getenv("SERVERUI_ALLOWED_ORIGINS"), ",") {
		if a := strings.TrimSpace(allowed); a != "" && strings.EqualFold(a, origin) {
			return true
		}
	}
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if !allowedHostNames()[host] {
		return false
	}
	if strings.EqualFold(hostnameOf(r.Host), host) {
		return true
	}
	// Behind the Next proxy the request carries the browser's host in X-Forwarded-Host.
	return strings.EqualFold(hostnameOf(strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Host"), ",")[0])), host)
}

// defaultAllowedHosts are the names the web deployment answers to out of the box: this machine,
// and "server", the compose service name the Next proxy uses.
var defaultAllowedHosts = []string{"localhost", "127.0.0.1", "::1", "server"}

// allowedHostNames is the set of Host names the API serves in web mode. A page on any other name
// that resolves to this machine (DNS rebinding) is refused, whatever Origin it sends. Add the
// names you really use with SERVERUI_ALLOWED_HOSTS (a LAN address, a domain behind a proxy).
func allowedHostNames() map[string]bool {
	set := map[string]bool{}
	for _, h := range defaultAllowedHosts {
		set[h] = true
	}
	for _, h := range strings.Split(os.Getenv("SERVERUI_ALLOWED_HOSTS"), ",") {
		if h = strings.ToLower(hostnameOf(strings.TrimSpace(h))); h != "" {
			set[h] = true
		}
	}
	for _, o := range strings.Split(os.Getenv("SERVERUI_ALLOWED_ORIGINS"), ",") {
		if u, err := url.Parse(strings.TrimSpace(o)); err == nil && u.Hostname() != "" {
			set[strings.ToLower(u.Hostname())] = true
		}
	}
	return set
}

// webHostAllowed checks the Host header and every X-Forwarded-Host value. A browser cannot forge
// Host, so after a DNS rebinding the attacker's own name is what shows up here.
func webHostAllowed(r *http.Request) bool {
	allowed := allowedHostNames()
	if !allowed[strings.ToLower(hostnameOf(r.Host))] {
		return false
	}
	// Every header line and every comma-separated value counts, not just the first one.
	for _, line := range r.Header.Values("X-Forwarded-Host") {
		for _, v := range strings.Split(line, ",") {
			if v = strings.TrimSpace(v); v != "" && !allowed[strings.ToLower(hostnameOf(v))] {
				return false
			}
		}
	}
	return true
}

func hostnameOf(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return strings.Trim(h, "[]")
	}
	return strings.Trim(hostport, "[]")
}

// ValidateAuthConfig fails closed on a desktop-mode start without a local token, which would
// otherwise leave the API open on loopback.
func ValidateAuthConfig() error {
	if DesktopMode() && localAuthToken() == "" {
		return errors.New("SERVERUI_DESKTOP is set but SERVERUI_LOCAL_AUTH_TOKEN is empty")
	}
	return nil
}

// originAllowed is the desktop allowlist: the packaged app and local development pages only.
func originAllowed(origin string) bool {
	if origin == "" || !DesktopMode() {
		return false
	}
	o := strings.TrimSpace(origin)
	switch {
	case o == "tauri://localhost",
		o == "https://tauri.localhost",
		o == "http://tauri.localhost",
		o == "https://localhost",
		o == "http://localhost",
		o == "http://127.0.0.1",
		strings.HasPrefix(o, "http://localhost:"),
		strings.HasPrefix(o, "http://127.0.0.1:"),
		strings.HasPrefix(o, "https://localhost:"),
		strings.HasPrefix(o, "https://127.0.0.1:"):
		return true
	default:
		return false
	}
}

// SelectedWebSocketProtocol returns the local-auth subprotocol to echo, if any.
func SelectedWebSocketProtocol(r *http.Request) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(p, LocalAuthWSProtocolPrefix) {
			return p
		}
	}
	return ""
}

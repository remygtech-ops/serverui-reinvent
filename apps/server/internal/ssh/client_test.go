package sshx

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func TestDialPasswordAndKey(t *testing.T) {
	password := "correct-horse"
	signer := testClientSigner(t)
	addr := startTestSSHServer(t, "deploy", password, signer.PublicKey())
	host, port := splitAddr(t, addr)

	client, err := Dial(Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: password})
	if err != nil {
		t.Fatalf("password auth: %v", err)
	}
	_ = client.Close()

	client, err = Dial(Config{Host: host, Port: port, Username: "deploy"}, PublicKeyAuth{signer: signer})
	if err != nil {
		t.Fatalf("key auth: %v", err)
	}
	_ = client.Close()
}

func TestDialInvalidPassword(t *testing.T) {
	addr := startTestSSHServer(t, "deploy", "correct", nil)
	host, port := splitAddr(t, addr)
	_, err := Dial(Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: "wrong"})
	if err == nil {
		t.Fatal("expected auth failure")
	}
	if PublicError(err) != "authentication failed" {
		t.Fatalf("public error %q", PublicError(err))
	}
}

func TestDialUnreachable(t *testing.T) {
	_, err := Dial(Config{Host: "127.0.0.1", Port: 1, Username: "deploy"}, PasswordAuth{Password: "x"})
	if err == nil {
		t.Fatal("expected connection failure")
	}
	if PublicError(err) != "unable to connect to server" && PublicError(err) != "ssh connection failed" {
		t.Fatalf("public error %q", PublicError(err))
	}
}

func TestPoolConcurrentConnectionsAreIndependent(t *testing.T) {
	password := "correct-horse"
	addrA := startTestSSHServer(t, "deploy", password, nil)
	addrB := startTestSSHServer(t, "deploy", password, nil)
	addrC := startTestSSHServer(t, "deploy", password, nil)
	addrs := map[string]string{"a": addrA, "b": addrB, "c": addrC}
	loads := map[string]int{}

	pool := NewPool(func(id string) (Config, AuthMethod, error) {
		loads[id]++
		if id == "bad" {
			host, port := splitAddr(t, addrA)
			return Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: "wrong"}, nil
		}
		addr, ok := addrs[id]
		if !ok {
			return Config{}, nil, fmt.Errorf("unknown server %s", id)
		}
		host, port := splitAddr(t, addr)
		return Config{Host: host, Port: port, Username: "deploy"}, PasswordAuth{Password: password}, nil
	})

	for _, id := range []string{"a", "b", "c"} {
		if _, err := pool.Ensure(id); err != nil {
			t.Fatalf("ensure %s: %v", id, err)
		}
	}
	// A second ensure must reuse the pooled client instead of dialing again.
	clientA, err := pool.Ensure("a")
	if err != nil {
		t.Fatal(err)
	}
	clientA2, err := pool.Ensure("a")
	if err != nil {
		t.Fatal(err)
	}
	if clientA != clientA2 {
		t.Fatal("repeated ensure created another client")
	}
	if loads["a"] != 1 || loads["b"] != 1 || loads["c"] != 1 {
		t.Fatalf("loads = %#v", loads)
	}
	for _, id := range []string{"a", "b", "c"} {
		if !pool.IsConnected(id) {
			t.Fatalf("%s not connected", id)
		}
	}

	if _, err := pool.Ensure("bad"); err == nil {
		t.Fatal("expected authentication failure")
	}
	if pool.IsConnected("bad") {
		t.Fatal("failed auth left a live session")
	}
	if !pool.IsConnected("a") || !pool.IsConnected("b") || !pool.IsConnected("c") {
		t.Fatal("auth failure disturbed other sessions")
	}

	if err := pool.Disconnect("b"); err != nil {
		t.Fatal(err)
	}
	if pool.IsConnected("b") {
		t.Fatal("b still connected")
	}
	if !pool.IsConnected("a") || !pool.IsConnected("c") {
		t.Fatal("disconnect closed an unrelated session")
	}

	pool.Forget("c")
	if pool.IsConnected("c") {
		t.Fatal("c still connected after forget")
	}
	if !pool.IsConnected("a") {
		t.Fatal("forget closed an unrelated session")
	}
}

func TestPoolIsolatesServers(t *testing.T) {
	calls := map[string]int{}
	pool := NewPool(func(id string) (Config, AuthMethod, error) {
		calls[id]++
		if id == "server-B" {
			return Config{}, nil, fmt.Errorf("should not load server-B")
		}
		return Config{Host: "127.0.0.1", Port: 1, Username: "alice"}, PasswordAuth{Password: "a"}, nil
	})
	if _, err := pool.Manager("server-A"); err != nil {
		t.Fatal(err)
	}
	if calls["server-A"] != 1 || calls["server-B"] != 0 {
		t.Fatalf("calls %#v", calls)
	}
}

func startTestSSHServer(t *testing.T, user, password string, pub ssh.PublicKey) string {
	t.Helper()
	config := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			if conn.User() == user && string(pass) == password {
				return nil, nil
			}
			return nil, fmt.Errorf("permission denied")
		},
	}
	if pub != nil {
		config.PublicKeyCallback = func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if conn.User() == user && string(key.Marshal()) == string(pub.Marshal()) {
				return nil, nil
			}
			return nil, fmt.Errorf("permission denied")
		}
	}
	hostKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(hostKey)
	if err != nil {
		t.Fatal(err)
	}
	config.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			nConn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				_ = c.SetDeadline(time.Now().Add(5 * time.Second))
				conn, chans, reqs, err := ssh.NewServerConn(c, config)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for newCh := range chans {
						newCh.Reject(ssh.Prohibited, "no channels")
					}
				}()
				_ = conn.Wait()
			}(nConn)
		}
	}()
	return ln.Addr().String()
}

func testClientSigner(t *testing.T) ssh.Signer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func splitAddr(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portS, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	var port int
	_, err = fmt.Sscanf(portS, "%d", &port)
	if err != nil {
		t.Fatal(err)
	}
	return host, port
}

func rsaPKCS1(key *rsa.PrivateKey) []byte {
	return x509.MarshalPKCS1PrivateKey(key)
}

func TestDialPinsTheHostKeyOnFirstUseAndRefusesAChange(t *testing.T) {
	addr := startTestSSHServer(t, "alice", "pw", nil)
	host, port := splitAddr(t, addr)
	var pinned string
	cfg := Config{Host: host, Port: port, Username: "alice", OnHostKey: func(fp string) { pinned = fp }}
	client, err := Dial(cfg, PasswordAuth{Password: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	_ = client.Close()
	if !strings.HasPrefix(pinned, "SHA256:") {
		t.Fatalf("first use should report a fingerprint, got %q", pinned)
	}

	// The same key stays trusted.
	cfg = Config{Host: host, Port: port, Username: "alice", PinnedHostKey: pinned}
	client, err = Dial(cfg, PasswordAuth{Password: "pw"})
	if err != nil {
		t.Fatalf("pinned key should be accepted: %v", err)
	}
	_ = client.Close()

	// Another key, as a man in the middle would present, is refused before authentication.
	cfg.PinnedHostKey = "SHA256:someOtherKeyFingerprintThatDoesNotMatch"
	if _, err = Dial(cfg, PasswordAuth{Password: "pw"}); err == nil {
		t.Fatal("a changed host key must be refused")
	}
	if code, _ := ClassifyError(err); code != CodeHostKeyChanged {
		t.Fatalf("code %q for %v", code, err)
	}
}

func TestManagerEnforcesAPinRecordedAfterItWasCreated(t *testing.T) {
	addr := startTestSSHServer(t, "alice", "pw", nil)
	host, port := splitAddr(t, addr)
	var stored string // stands in for the servers table
	cfg := Config{
		Host: host, Port: port, Username: "alice",
		PinLookup: func() string { return stored },
		OnHostKey: func(fp string) {
			if stored == "" {
				stored = fp
			}
		},
	}
	mgr := NewManager(cfg, PasswordAuth{Password: "pw"})
	client, err := mgr.Ensure()
	if err != nil {
		t.Fatal(err)
	}
	if stored == "" {
		t.Fatal("first connection should pin the key")
	}
	// The connection drops, then the peer presents a different key than the pinned one.
	pinned := stored
	stored = "SHA256:aDifferentKeyThanTheOneTrustedAtFirstUse"
	_ = client.Close()
	for i := 0; i < 50 && func() bool { st, _ := mgr.Status(); return st == StatusOnline }(); i++ {
		time.Sleep(20 * time.Millisecond)
	}
	if _, err := mgr.Ensure(); err == nil {
		t.Fatal("a reconnect must enforce the pin that is stored now, not the one seen at creation")
	}
	_ = pinned
}

package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtractRequiresKnownServer(t *testing.T) {
	handler := testAPI(t)
	body := `{"serverId":"missing","path":"/srv/site.zip","mode":"here"}`
	req := newJSONRequest(http.MethodPost, "/api/files/extract", strings.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestExtractJobEndpointsReturnNotFound(t *testing.T) {
	handler := testAPI(t)
	cases := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodGet, "/api/files/extract/nope?serverId=srv", ""},
		{http.MethodDelete, "/api/files/extract/nope?serverId=srv", ""},
		{http.MethodPost, "/api/files/extract/nope/resolve", `{"serverId":"srv","policy":"replace"}`},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.url, strings.NewReader(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s %s: status %d %s", tc.method, tc.url, rec.Code, rec.Body.String())
		}
	}
}

func TestExtractJobEndpointsRequireServerID(t *testing.T) {
	handler := testAPI(t)
	req := httptest.NewRequest(http.MethodGet, "/api/files/extract/job", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

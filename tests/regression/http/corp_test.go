package regression

import (
	"testing"

	"everything.dev/regression/http/internal/regtest"
)

func TestCORPHeaders(t *testing.T) {
	client := regtest.NewCookieClient()

	t.Run("static_asset_has_cross_origin_corp", func(t *testing.T) {
		assets := []string{"/favicon.ico", "/metadata.png", "/favicon-96x96.png", "/site.webmanifest"}
		for _, path := range assets {
			status, headers, body := regtest.GetRaw(t, client, baseURL+path)
			regtest.MustStatus(t, status, 200, body)
			corp := headers.Get("Cross-Origin-Resource-Policy")
			if corp != "cross-origin" {
				t.Fatalf("GET %s: expected Cross-Origin-Resource-Policy \"cross-origin\", got %q", path, corp)
			}
		}
	})

	t.Run("html_page_has_same_origin_corp", func(t *testing.T) {
		status, headers, body := regtest.GetRaw(t, client, baseURL+"/")
		regtest.MustStatus(t, status, 200, body)
		corp := headers.Get("Cross-Origin-Resource-Policy")
		if corp != "same-origin" {
			t.Fatalf("GET /: expected Cross-Origin-Resource-Policy \"same-origin\", got %q", corp)
		}
	})

	t.Run("api_route_has_same_origin_corp", func(t *testing.T) {
		status, headers, body := regtest.GetRaw(t, client, baseURL+"/api/ping")
		regtest.MustStatus(t, status, 200, body)
		corp := headers.Get("Cross-Origin-Resource-Policy")
		if corp != "same-origin" {
			t.Fatalf("GET /api/ping: expected Cross-Origin-Resource-Policy \"same-origin\", got %q", corp)
		}
	})
}

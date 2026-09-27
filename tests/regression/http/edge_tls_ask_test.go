package regression

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"everything.dev/regression/http/internal/regtest"
)

// The edge's Caddy on_demand_tls ask endpoint: permission is status-code-only.
// 2xx allows certificate issuance for the SNI hostname, anything else denies;
// Caddy ignores the body entirely.
func TestEdgeTlsAsk(t *testing.T) {
	client := regtest.NewCookieClient()

	subdomain := fmt.Sprintf("regression-ask-%d", os.Getpid())
	t.Run("seed_verified_binding", func(t *testing.T) {
		seeded := regtest.SeedTenant(t, map[string]any{
			"subdomain": subdomain,
			"name":      "Ask Tenant",
			"accountId": fmt.Sprintf("%s.testnet", subdomain),
		})
		if seeded == "" {
			t.Fatal("expected non-empty tenant id")
		}
	})

	t.Run("verified_hostname_allowed", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client, baseURL+"/api/edge/tls-ask?domain="+subdomain)
		regtest.MustStatus(t, status, 200, body)
	})

	t.Run("hostname_case_insensitive", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client,
			baseURL+"/api/edge/tls-ask?domain="+strings.ToUpper(subdomain))
		regtest.MustStatus(t, status, 200, body)
	})

	t.Run("unknown_hostname_denied", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client,
			baseURL+"/api/edge/tls-ask?domain=not-a-binding.example")
		regtest.MustStatus(t, status, 404, body)
	})

	t.Run("missing_domain_param_denied", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client, baseURL+"/api/edge/tls-ask")
		if status < 400 {
			t.Fatalf("expected non-2xx denial for missing domain param, got %d\nBody: %s", status, body)
		}
	})
}

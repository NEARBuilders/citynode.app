package regression

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"everything.dev/regression/http/internal/regtest"
)

// The agents plugin rides the deploy train like any other plugin — these
// checks assert its surface actually landed behind the host: OpenAPI paths
// in the spec (MCP tools derive from the same contract), the public ping,
// and session-gated owner reads that must not 404.
func TestAgentsSurface(t *testing.T) {
	client := regtest.NewCookieClient()

	t.Run("spec_json_contains_agents_paths", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client, baseURL+"/api/spec.json")
		regtest.MustStatus(t, status, 200, body)

		var doc struct {
			Paths map[string]any `json:"paths"`
		}
		if err := json.Unmarshal([]byte(body), &doc); err != nil {
			t.Fatalf("spec.json not valid JSON: %v\nBody: %s", err, body)
		}

		for _, path := range []string{
			"/agents",
			"/agents/get",
			"/agents/wallet",
			"/agents/balances",
			"/agents/policy",
			"/agents/swap",
			"/agents/withdraw",
			"/generate-intent",
			"/submit-intent",
			"/tokens",
		} {
			if _, ok := doc.Paths[path]; !ok {
				t.Fatalf("expected agents path %s in OpenAPI spec (plugin not in the federation set?)", path)
			}
		}
	})

	t.Run("ping_is_public", func(t *testing.T) {
		status, _, body := regtest.PostRaw(t, client, baseURL+"/api/rpc/agents/ping", []byte(`{}`), nil)
		regtest.MustStatus(t, status, 200, body)
		regtest.MustContain(t, body, "message")
	})

	t.Run("owner_reads_reject_unauthenticated", func(t *testing.T) {
		status, _, body := regtest.PostRaw(t, client, baseURL+"/api/rpc/agents/listAgents", []byte(`{}`), nil)
		if status == http.StatusNotFound {
			t.Fatalf("agents listAgents route not mounted (404) — plugin failed to load")
		}
		if status == http.StatusOK {
			t.Fatalf("agents listAgents answered without a session — owner routes must be session-gated")
		}
		regtest.MustContain(t, strings.ToLower(body), "unauthorized")
	})
}

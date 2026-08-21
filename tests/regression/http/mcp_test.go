package regression

import (
	"encoding/json"
	"strings"
	"testing"

	"everything.dev/regression/http/internal/regtest"
)

func TestMcpEndpoint(t *testing.T) {
	client := regtest.NewCookieClient()

	t.Run("initialize", func(t *testing.T) {
		initReq := map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"method":  "initialize",
			"params": map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{},
				"clientInfo": map[string]any{
					"name":    "regression-test",
					"version": "1.0.0",
				},
			},
		}

		status, _, body := regtest.PostJSON(t, client, baseURL+"/api/mcp", initReq, nil)
		regtest.MustStatus(t, status, 200, body)

		var result struct {
			Result struct {
				ProtocolVersion string `json:"protocolVersion"`
				ServerInfo      struct {
					Name string `json:"name"`
				} `json:"serverInfo"`
				Capabilities map[string]any `json:"capabilities"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(body), &result); err != nil {
			t.Fatalf("decoding MCP initialize response: %v\nBody: %s", err, body)
		}

		if result.Result.ProtocolVersion == "" {
			t.Fatalf("expected non-empty protocolVersion, got empty. Body: %s", body)
		}
		if result.Result.ServerInfo.Name == "" {
			t.Fatalf("expected non-empty serverInfo.name, got empty. Body: %s", body)
		}
		if !strings.Contains(result.Result.ServerInfo.Name, "MCP") {
			t.Fatalf("expected serverInfo.name to contain 'MCP', got %q", result.Result.ServerInfo.Name)
		}
	})

	t.Run("tools_list", func(t *testing.T) {
		initReq := map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"method":  "initialize",
			"params": map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{},
				"clientInfo":      map[string]any{"name": "regression-test", "version": "1.0.0"},
			},
		}
		regtest.PostJSON(t, client, baseURL+"/api/mcp", initReq, nil)

		listReq := map[string]any{
			"jsonrpc": "2.0",
			"id":      2,
			"method":  "tools/list",
			"params":  map[string]any{},
		}

		status, _, body := regtest.PostJSON(t, client, baseURL+"/api/mcp", listReq, nil)
		regtest.MustStatus(t, status, 200, body)

		var result struct {
			Result struct {
				Tools []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
				} `json:"tools"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(body), &result); err != nil {
			t.Fatalf("decoding tools/list response: %v\nBody: %s", err, body)
		}

		if len(result.Result.Tools) == 0 {
			t.Fatalf("expected at least 1 tool, got 0. Body: %s", body)
		}

		hasPing := false
		for _, tool := range result.Result.Tools {
			if tool.Name == "ping" {
				hasPing = true
				break
			}
		}
		if !hasPing {
			t.Fatalf("expected 'ping' tool in list, not found. Tools: %v", result.Result.Tools)
		}
	})
}

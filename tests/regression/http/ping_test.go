package regression

import (
	"encoding/json"
	"testing"

	"everything.dev/regression/http/internal/regtest"
)

func TestAPIPing(t *testing.T) {
	client := regtest.NewCookieClient()

	t.Run("api_ping", func(t *testing.T) {
		status, _, body := regtest.GetRaw(t, client, baseURL+"/api/ping")
		regtest.MustStatus(t, status, 200, body)

		var result struct {
			Status    string `json:"status"`
			Timestamp string `json:"timestamp"`
		}
		if err := json.Unmarshal([]byte(body), &result); err != nil {
			t.Fatalf("decoding ping response: %v\nBody: %s", err, body)
		}

		if result.Status != "ok" {
			t.Fatalf("expected ping status 'ok', got %q", result.Status)
		}
		if result.Timestamp == "" {
			t.Fatal("expected non-empty timestamp")
		}
	})
}

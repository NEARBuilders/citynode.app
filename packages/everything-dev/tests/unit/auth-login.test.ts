import { describe, expect, it } from "vitest";
import { startLoginServer } from "../../src/auth-login";

function postCallback(port: number, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("login server handoff", () => {
  it("resolves a handoff that arrives before waitForHandoff is called", async () => {
    const handle = await startLoginServer({ siteUrl: "http://localhost:3003" });
    try {
      const res = await postCallback(handle.port, {
        state: handle.state,
        key: "edk_test",
        keyId: "key_1",
        account: "alice.near",
      });
      expect(res.status).toBe(200);

      await expect(handle.waitForHandoff(1_000)).resolves.toEqual({
        apiKey: "edk_test",
        apiKeyId: "key_1",
        accountId: "alice.near",
        added: undefined,
        error: undefined,
      });
    } finally {
      handle.close();
    }
  });

  it("rejects handoffs with a state mismatch and drops GET navigation", async () => {
    const handle = await startLoginServer({ siteUrl: "http://localhost:3003" });
    const pending = handle.waitForHandoff(1_000);
    pending.catch(() => {});
    try {
      const mismatch = await postCallback(handle.port, {
        state: "wrong-state",
        key: "edk_test",
        keyId: "key_1",
      });
      expect(mismatch.status).toBe(400);

      const get = await fetch(`http://127.0.0.1:${handle.port}/callback?state=${handle.state}`);
      expect(get.status).toBe(405);
    } finally {
      handle.close();
    }
  });

  it("resolves delegate-mode handoffs with added and no key", async () => {
    const handle = await startLoginServer({ siteUrl: "http://localhost:3003" });
    try {
      const res = await postCallback(handle.port, {
        state: handle.state,
        account: "alice.near",
        added: 1,
      });
      expect(res.status).toBe(200);

      await expect(handle.waitForHandoff(1_000)).resolves.toEqual(
        expect.objectContaining({ accountId: "alice.near", added: true }),
      );
    } finally {
      handle.close();
    }
  });
});

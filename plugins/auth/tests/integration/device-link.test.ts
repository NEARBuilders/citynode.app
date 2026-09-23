import { beforeEach, describe, expect, it } from "vitest";
import type { PluginServices } from "../../src/service-types";
import { createTestServices, createTestUser, type TestUser } from "../helpers";

const CLIENT_ID = "citynode-web";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function authRequest(path: string, init: { method: string; body?: unknown; cookie?: string }) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: init.method,
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

describe("device link", () => {
  let services: PluginServices;
  let user: TestUser;

  beforeEach(async () => {
    ({ services } = await createTestServices({ deviceLink: { clientId: CLIENT_ID } }));
    user = await createTestUser(services);
  });

  it("issues a device code that an authenticated phone can approve, then exchanges the token for a cookie session", async () => {
    const codeRes = await services.handler(
      authRequest("/device/code", { method: "POST", body: { client_id: CLIENT_ID } }),
    );
    expect(codeRes.status).toBe(200);
    const code = (await codeRes.json()) as {
      device_code: string;
      user_code: string;
      verification_uri_complete: string;
      interval: number;
    };
    expect(code.user_code).toMatch(/^[A-Z2-9]{8}$/);
    expect(code.verification_uri_complete).toContain("/device");

    const verifyRes = await services.handler(
      authRequest(`/device?user_code=${code.user_code}`, { method: "GET", cookie: user.cookie }),
    );
    expect(verifyRes.status).toBe(200);

    const approveRes = await services.handler(
      authRequest("/device/approve", {
        method: "POST",
        body: { userCode: code.user_code },
        cookie: user.cookie,
      }),
    );
    expect(approveRes.status).toBe(200);
    expect(((await approveRes.json()) as { success?: boolean }).success).toBe(true);

    const tokenRes = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: code.device_code, client_id: CLIENT_ID },
      }),
    );
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { access_token: string; token_type: string };
    expect(token.access_token).toBeTruthy();
    expect(token.token_type).toBe("Bearer");

    const claimRes = await services.handler(
      authRequest("/device-link/claim", { method: "POST", body: { token: token.access_token } }),
    );
    expect(claimRes.status).toBe(200);
    const setCookie = claimRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token=");

    const sessionCookie = setCookie.split(";")[0];
    const sessionRes = await services.handler(
      authRequest("/get-session", { method: "GET", cookie: sessionCookie }),
    );
    const session = (await sessionRes.json()) as { user?: { id: string } };
    expect(session?.user?.id).toBe(user.userId);
  });

  it("rejects the token endpoint for unregistered client ids", async () => {
    const codeRes = await services.handler(
      authRequest("/device/code", { method: "POST", body: { client_id: CLIENT_ID } }),
    );
    const code = (await codeRes.json()) as { device_code: string };

    const tokenRes = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: code.device_code, client_id: "evil-client" },
      }),
    );
    expect(tokenRes.status).toBe(400);
    const body = (await tokenRes.json()) as { error?: string };
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects client ids that are not configured", async () => {
    const codeRes = await services.handler(
      authRequest("/device/code", { method: "POST", body: { client_id: "everything-dev" } }),
    );
    expect(codeRes.status).toBe(400);

    const tokenRes = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: "any", client_id: "everything-dev" },
      }),
    );
    expect(tokenRes.status).toBe(400);
    const body = (await tokenRes.json()) as { error?: string };
    expect(body.error).toBe("invalid_grant");
  });

  it("returns authorization_pending before approval", async () => {
    const codeRes = await services.handler(
      authRequest("/device/code", { method: "POST", body: { client_id: CLIENT_ID } }),
    );
    const code = (await codeRes.json()) as { device_code: string };

    const tokenRes = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: code.device_code, client_id: CLIENT_ID },
      }),
    );
    expect(tokenRes.status).toBe(400);
    const body = (await tokenRes.json()) as { error?: string };
    expect(body.error).toBe("authorization_pending");
  });

  it("rejects unknown tokens on the claim endpoint", async () => {
    const claimRes = await services.handler(
      authRequest("/device-link/claim", { method: "POST", body: { token: "not-a-real-token" } }),
    );
    expect(claimRes.status).toBe(401);
  });

  it("refuses to redeem a device code twice and rejects a consumed token", async () => {
    const codeRes = await services.handler(
      authRequest("/device/code", { method: "POST", body: { client_id: CLIENT_ID } }),
    );
    const code = (await codeRes.json()) as { device_code: string; user_code: string };

    await services.handler(
      authRequest(`/device?user_code=${code.user_code}`, { method: "GET", cookie: user.cookie }),
    );
    await services.handler(
      authRequest("/device/approve", {
        method: "POST",
        body: { userCode: code.user_code },
        cookie: user.cookie,
      }),
    );

    const first = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: code.device_code, client_id: CLIENT_ID },
      }),
    );
    expect(first.status).toBe(200);
    const token = (await first.json()) as { access_token: string };

    const second = await services.handler(
      authRequest("/device/token", {
        method: "POST",
        body: { grant_type: GRANT_TYPE, device_code: code.device_code, client_id: CLIENT_ID },
      }),
    );
    expect(second.status).toBe(400);

    const claimRes = await services.handler(
      authRequest("/device-link/claim", { method: "POST", body: { token: token.access_token } }),
    );
    expect(claimRes.status).toBe(200);
    const setCookie = claimRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token=");
  });
});

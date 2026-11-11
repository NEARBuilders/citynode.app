import { createHmac } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { authedContext, getPluginBaseUrl, getPluginClient, teardown } from "../setup";

const SECRET = "whsec_route_fixture";

vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        variables: { ...original.default.config.variables, lumaMainCalendarId: "cal-main" },
        secrets: {
          ...original.default.config.secrets,
          LUMA_WEBHOOK_SECRETS: "whsec_route_fixture",
        },
      },
    },
  };
});
afterAll(teardown);

function deliver(payload: unknown, secret = SECRET) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return fetch(`${getPluginBaseUrl()}/api/webhooks/luma`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": "msg-fixture",
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
}

const onlineEvent = {
  platform: "luma",
  id: "evt-route-online",
  calendar_id: "cal-main",
  name: "Online route check",
  url: "https://luma.com/route-online",
  start_at: "2099-02-01T12:00:00Z",
  end_at: "2099-02-01T13:00:00Z",
  created_at: "2026-11-01T12:00:00Z",
  timezone: "UTC",
  visibility: "public",
  location_visibility: "public",
  location_type: "zoom",
  meeting_url: "https://example.com/meeting",
  coordinate: null,
  geo_address_json: null,
};

it("verifies the signature over the raw body before handling a Luma delivery", async () => {
  await getPluginClient();
  const forged = await deliver({ type: "event.created", data: onlineEvent }, "whsec_wrong");
  expect(forged.status).toBe(401);

  const accepted = await deliver({ type: "event.created", data: onlineEvent });
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ result: "unmatched" });

  const ignored = await deliver({ type: "guest.registered", data: { id: "gst-1" } });
  expect(await ignored.json()).toEqual({ result: "ignored" });

  const canceled = await deliver({ type: "event.canceled", data: onlineEvent });
  expect(await canceled.json()).toEqual({ result: "removed" });
});

it("lets only platform admins run the main calendar backfill", async () => {
  const member = await getPluginClient(authedContext("member-user"));
  await expect(member.backfillDiscoveryLumaPlaceEvents()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

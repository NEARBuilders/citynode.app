import { createHmac } from "node:crypto";
import { Effect } from "effect";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import {
  activateTestNode,
  authedContext,
  daoContext,
  getPluginBaseUrl,
  getPluginClient,
  orgContext,
  teardown,
} from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        secrets: {
          ...original.default.config.secrets,
          LUMA_CALENDAR_API_KEYS: "fixture-key",
          LUMA_WEBHOOK_SECRETS: "whsec_calendar_fixture",
        },
      },
    },
  };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(teardown);

async function deliver(calendarId: string, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "whsec_calendar_fixture")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const response = await fetch(`${getPluginBaseUrl()}/api/webhooks/luma/${calendarId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-signature": `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { result: string };
}

it("connects a community calendar once and keeps its events current through webhooks", async () => {
  const realFetch = globalThis.fetch;
  let title = "Luma builders meetup";
  let visibility = "public";
  let partialFailure = false;
  const lumaEvent = () => ({
    id: "evt-fixture",
    platform: "luma",
    calendar_id: "cal-fixture",
    name: title,
    url: "https://luma.com/meetup",
    start_at: "2027-01-01T12:00:00Z",
    end_at: "2027-01-01T14:00:00Z",
    created_at: "2026-09-01T12:00:00Z",
    timezone: "UTC",
    visibility,
    location_visibility: "guests-only",
    geo_address_json: { full_address: "Private guest address", city_state: null },
  });
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://public-api.luma.com") return realFetch(input, init);
    expect(new Headers(init?.headers).get("x-luma-api-key")).toBe("fixture-key");
    if (url.pathname === "/v1/calendars/get")
      return Response.json({
        id: "cal-fixture",
        name: "Builders",
        url: "https://luma.com/builders",
      });
    if (url.pathname === "/v1/events/get") return Response.json(lumaEvent());
    if (url.searchParams.has("pagination_cursor") && partialFailure)
      return new Response("Rate limited", { status: 429 });
    return Response.json({
      entries: [lumaEvent()],
      has_more: partialFailure,
      next_cursor: partialFailure ? "page-2" : undefined,
    });
  });
  const provisioner = await getPluginClient(daoContext("luma-owner", "luma-org", "luma.near"));
  const tenant = await provisioner.createTenant({ name: "Luma node", accountId: "luma.near" });
  const { node } = await activateTestNode({
    name: "Luma city",
    slug: "luma-city",
    kind: "city",
    tenantId: tenant.id,
    orgId: "luma-org",
  });
  const editor = await getPluginClient(orgContext("luma-owner", "luma-org"));
  await editor.saveDiscoveryProfile({
    nodeId: node.id,
    summary: "Luma community",
    location: "",
    region: "",
    latitude: null,
    longitude: null,
    channels: [],
    published: true,
  });
  const publicClient = await getPluginClient();
  const member = await getPluginClient(orgContext("ordinary", "luma-org", "member"));
  await expect(
    member.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-fixture" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await deliver("cal-fixture", { type: "event.updated", data: lumaEvent() })).toEqual({
    result: "ignored",
  });
  expect(
    await editor.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-fixture" }),
  ).toMatchObject({ imported: 1, updated: 0 });
  const [first] = await editor.listDiscoveryActivities({ nodeId: node.id });
  expect(first).toMatchObject({
    title,
    status: "published",
    source: "Luma · Builders",
    venue: "See Luma for location details",
    luma: { eventId: "evt-fixture", calendarId: "cal-fixture" },
  });
  expect(first!.luma).not.toHaveProperty("hidden");
  expect(JSON.stringify(first)).not.toContain("Private guest address");
  expect(await editor.listDiscoveryLumaCalendars({ nodeId: node.id })).toMatchObject({
    connection: { calendarId: "cal-fixture", webhookPath: "/api/webhooks/luma/cal-fixture" },
  });
  expect(await publicClient.getDiscoveryActivity({ id: first!.id })).toMatchObject({
    status: "published",
  });
  expect((await publicClient.listDiscovery({})).flatMap((node) => node.events)).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: first!.id })]),
  );

  title = "Updated in Luma";
  expect(await deliver("cal-fixture", { type: "event.updated", data: lumaEvent() })).toEqual({
    result: "associated",
  });
  const refreshed = await editor.listDiscoveryActivities({ nodeId: node.id });
  expect(refreshed).toHaveLength(1);
  expect(refreshed[0]).toMatchObject({ id: first!.id, title, status: "published" });
  const owned = { ...refreshed[0]!, ownerNodeId: node.id };
  await expect(
    editor.saveDiscoveryActivity({ ...owned, title: "Local override" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(editor.saveDiscoveryActivity({ ...owned, status: "draft" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  await editor.saveDiscoveryActivity({
    ...owned,
    id: undefined,
    url: "https://example.com/manual-event",
    title: "Manual meetup",
  });

  partialFailure = true;
  await expect(
    editor.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-fixture" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(
    (await editor.listDiscoveryActivities({ nodeId: node.id })).find((a) => a.id === first!.id),
  ).toMatchObject({ title, status: "published" });
  partialFailure = false;

  visibility = "private";
  expect(await deliver("cal-fixture", { type: "event.updated", data: lumaEvent() })).toEqual({
    result: "removed",
  });
  expect(
    (await editor.listDiscoveryActivities({ nodeId: node.id })).find((a) => a.luma),
  ).toBeUndefined();
  expect(await publicClient.getDiscoveryActivity({ id: first!.id })).toBeNull();
  visibility = "public";
  await deliver("cal-fixture", {
    type: "calendar.event.added",
    data: { id: "evt-fixture", platform: "luma" },
  });
  const returned = (await editor.listDiscoveryActivities({ nodeId: node.id })).find((a) => a.luma)!;
  expect(returned).toMatchObject({ title, status: "published" });

  const { node: otherNode } = await activateTestNode({
    name: "Second Luma city",
    slug: "second-luma-city",
    kind: "city",
    tenantId: tenant.id,
    orgId: "luma-org",
  });
  await editor.importDiscoveryLuma({ nodeId: otherNode.id, calendarId: "cal-fixture" });
  title = "Shared across both";
  await deliver("cal-fixture", { type: "event.updated", data: lumaEvent() });
  for (const nodeId of [node.id, otherNode.id])
    expect((await editor.listDiscoveryActivities({ nodeId })).find((a) => a.luma)).toMatchObject({
      title,
      status: "published",
    });

  const admin = await getPluginClient(authedContext("luma-admin", "admin"));
  await publicClient.reportDiscoveryContent({
    targetId: returned.id,
    kind: "activity",
    token: crypto.randomUUID(),
    reason: "This event should be hidden",
  });
  const report = (await admin.getDiscoveryStudio()).reports.find(
    (report) => report.targetId === returned.id,
  )!;
  await admin.moderateDiscoveryReport({
    reportId: report.id,
    action: "unpublish",
    note: "Hidden by admin",
  });
  await deliver("cal-fixture", { type: "event.updated", data: lumaEvent() });
  expect(await publicClient.getDiscoveryActivity({ id: returned.id })).toBeNull();
  expect(
    (await editor.listDiscoveryActivities({ nodeId: node.id })).find((a) => a.id === returned.id),
  ).toMatchObject({ status: "draft" });

  expect(await deliver("cal-fixture", { type: "event.canceled", data: lumaEvent() })).toEqual({
    result: "removed",
  });
  expect(
    (await editor.listDiscoveryActivities({ nodeId: otherNode.id })).find((a) => a.luma),
  ).toMatchObject({ status: "cancelled" });

  await editor.disconnectDiscoveryLuma({ nodeId: node.id });
  expect(await editor.listDiscoveryLumaCalendars({ nodeId: node.id })).toMatchObject({
    connection: null,
  });
  const afterDisconnect = await editor.listDiscoveryActivities({ nodeId: node.id });
  expect(afterDisconnect.find((a) => a.luma)).toBeUndefined();
  expect(afterDisconnect.find((a) => a.title === "Manual meetup")).toMatchObject({
    status: "published",
  });
});

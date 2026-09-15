import { afterAll, describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(async () => ({
    isSputnikContract: true,
    isMember: true,
    policy: { roles: [] },
  })),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
afterAll(teardown);

async function fixture() {
  const id = crypto.randomUUID();
  const org = `discovery-${id}`;
  const provisioner = await getPluginClient(daoContext(id, org, `d-${id}.near`));
  const tenant = await provisioner.createTenant({
    name: "Discovery city",
    accountId: `d-${id}.near`,
  });
  const node = await provisioner.createNode({
    name: "Karachi",
    slug: `karachi-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return {
    node,
    tenant,
    provisioner,
    editor: await getPluginClient(orgContext(id, org)),
    member: await getPluginClient(orgContext("member", org, "member")),
    publicClient: await getPluginClient(),
  };
}
const profile = {
  summary: "A community by the sea",
  location: "Karachi",
  region: "Pakistan",
  latitude: 24.86,
  longitude: 67.01,
  channels: [{ label: "Community", url: "https://example.com/community" }],
  published: true,
};

describe("discovery publishing", () => {
  it("publishes only eligible profiles and rejects ordinary members and outsiders", async () => {
    const { node, tenant, provisioner, editor, member, publicClient } = await fixture();
    const input = { nodeId: node.id, ...profile };
    await expect(member.saveDiscoveryProfile(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await getPluginClient(authedContext("outsider"))).saveDiscoveryProfile(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await editor.saveDiscoveryProfile(input);
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
      nodeId: node.id,
      name: "Karachi",
      location: "Karachi",
    });
    expect(await publicClient.listDiscovery({})).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: node.id })]),
    );
    await editor.saveDiscoveryProfile({ ...input, published: false });
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toBeNull();
    await editor.saveDiscoveryProfile(input);
    await provisioner.updateTenant({ tenantId: tenant.id, status: "suspended" });
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toBeNull();
    expect(await publicClient.listDiscovery({})).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: node.id })]),
    );
  });
});

it("preserves multiple nodes per tenant and validates confirmed coordinates", async () => {
  const { node, tenant, editor, provisioner, publicClient } = await fixture();
  const sibling = await provisioner.createNode({
    name: "Online",
    slug: `online-${node.id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  await editor.saveDiscoveryProfile({ nodeId: node.id, ...profile });
  await editor.saveDiscoveryProfile({
    nodeId: sibling.id,
    ...profile,
    location: "",
    latitude: null,
    longitude: null,
  });
  const records = await publicClient.listDiscovery({});
  expect(records.filter((r) => [node.id, sibling.id].includes(r.nodeId))).toHaveLength(2);
  expect(Object.keys(records.find((r) => r.nodeId === node.id)!)).not.toEqual(
    expect.arrayContaining(["actorId", "history", "metadata"]),
  );
  await expect(
    editor.saveDiscoveryProfile({ nodeId: node.id, ...profile, longitude: null }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("publishes attributed activity, shares events and removes cancelled evidence", async () => {
  const { node, editor, publicClient } = await fixture();
  const other = await fixture();
  await editor.saveDiscoveryProfile({ nodeId: node.id, ...profile });
  await other.editor.saveDiscoveryProfile({ nodeId: other.node.id, ...profile });
  const admin = await getPluginClient(authedContext("discovery-admin", "admin"));
  const now = Date.now();
  const eventInput = {
    ownerNodeId: node.id,
    nodeIds: [node.id, other.node.id],
    kind: "event" as const,
    title: "Community meetup",
    summary: "Meet the builders",
    url: "https://example.com/meetup",
    source: "Community",
    publishedAt: new Date(now).toISOString(),
    startsAt: new Date(now + 86400000).toISOString(),
    endsAt: new Date(now + 90000000).toISOString(),
    timezone: "Asia/Karachi",
    venue: "Online",
    status: "published" as const,
  };
  await expect(editor.saveDiscoveryActivity(eventInput)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const event = await admin.saveDiscoveryActivity(eventInput);
  expect(await publicClient.getDiscoveryNode({ nodeId: other.node.id })).toMatchObject({
    active: true,
    events: [expect.objectContaining({ id: event.id })],
  });
  await expect(
    other.editor.saveDiscoveryActivity({ ...event, title: "Hijacked" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await admin.saveDiscoveryActivity({ ...event, status: "cancelled" });
  expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
    active: false,
    events: [],
  });
  expect(await publicClient.getDiscoveryActivity({ id: event.id })).toMatchObject({
    status: "cancelled",
  });
  const post = await editor.saveDiscoveryActivity({
    ...eventInput,
    nodeIds: [node.id],
    kind: "social",
    title: "New update",
    startsAt: null,
    endsAt: null,
    url: "https://example.com/post",
  });
  expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
    active: true,
    updates: [expect.objectContaining({ id: post.id })],
  });
  await expect(
    editor.saveDiscoveryActivity({
      ...post,
      id: undefined,
      url: "https://example.com/post#section",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await editor.saveDiscoveryActivity({ ...post, status: "draft" });
  expect(await publicClient.getDiscoveryActivity({ id: post.id })).toBeNull();
  expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
    active: false,
    updates: [],
  });
});

it("uses original dates at activity boundaries and never inherits freshness", async () => {
  const { node, editor, publicClient } = await fixture();
  await editor.saveDiscoveryProfile({ nodeId: node.id, ...profile });
  const now = Date.parse("2026-09-16T12:00:00Z");
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  try {
    const post = await editor.saveDiscoveryActivity({
      ownerNodeId: node.id,
      nodeIds: [node.id],
      kind: "social",
      title: "At boundary",
      summary: "",
      url: `https://example.com/${node.id}`,
      source: "Community",
      publishedAt: "2026-08-17T12:00:00Z",
      startsAt: null,
      endsAt: null,
      timezone: "UTC",
      venue: "",
      status: "published",
    });
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
      active: true,
    });
    clock.mockReturnValue(now + 1);
    await editor.saveDiscoveryActivity({ ...post, title: "Editing does not refresh activity" });
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
      active: false,
    });
    await editor.saveDiscoveryActivity({ ...post, publishedAt: "2027-01-01T00:00:00Z" });
    expect(await publicClient.getDiscoveryNode({ nodeId: node.id })).toMatchObject({
      active: false,
      updates: [],
    });
    expect(await publicClient.listDiscovery({ active: true })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: node.id })]),
    );
  } finally {
    clock.mockRestore();
  }
});

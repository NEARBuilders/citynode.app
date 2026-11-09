import { Effect } from "effect";
import { afterAll, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
afterAll(teardown);

async function fixture() {
  const id = crypto.randomUUID();
  const org = `onboard-${id}`;
  const provisioner = await getPluginClient(daoContext(id, org, `o-${id}.near`));
  const tenant = await provisioner.createTenant({
    name: "Onboard city",
    accountId: `o-${id}.near`,
  });
  const node = await provisioner.createNode({
    name: "Lisbon",
    slug: `lisbon-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return {
    id,
    org,
    node,
    tenant,
    provisioner,
    editor: await getPluginClient(orgContext(id, org)),
    publicClient: await getPluginClient(),
  };
}

const profile = {
  summary: "Builders by the river",
  location: "Lisbon",
  region: "Portugal",
  latitude: 38.72,
  longitude: -9.14,
  channels: [
    { label: "Telegram", url: "https://t.me/example" },
    { label: "X", url: "https://x.com/example" },
  ],
  published: true,
};

describe("the joined screen's community for an organization", () => {
  it("returns the community page and its published channels, signed out", async () => {
    const { org, node, editor, publicClient } = await fixture();
    await editor.saveDiscoveryProfile({ nodeId: node.id, ...profile });

    expect(await publicClient.getOnboardCommunity({ organizationId: org })).toEqual({
      name: "Lisbon",
      href: `/n/${node.slug}`,
      channels: profile.channels,
    });
  });

  it("still links the community when it has no published channels", async () => {
    const { org, node, editor, publicClient } = await fixture();
    expect(await publicClient.getOnboardCommunity({ organizationId: org })).toEqual({
      name: "Lisbon",
      href: `/n/${node.slug}`,
      channels: [],
    });

    await editor.saveDiscoveryProfile({ nodeId: node.id, ...profile, published: false });
    expect((await publicClient.getOnboardCommunity({ organizationId: org })).channels).toEqual([]);
  });

  it("picks the community's first node by name and keeps a child node's parent", async () => {
    const { id, org, node, tenant, provisioner, publicClient } = await fixture();
    const child = await provisioner.createNode({
      name: "Alfama",
      slug: `alfama-${id}`,
      kind: "city",
      tenantId: tenant.id,
      parentId: node.id,
    });
    expect((await publicClient.getOnboardCommunity({ organizationId: org })).href).toBe(
      `/n/${child.slug}?parentId=${node.id}`,
    );
  });

  it("is not found for unknown or suspended communities", async () => {
    const { org, tenant, provisioner, publicClient } = await fixture();
    await expect(
      publicClient.getOnboardCommunity({ organizationId: `missing-${crypto.randomUUID()}` }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await provisioner.suspendTenant({ tenantId: tenant.id });
    await expect(publicClient.getOnboardCommunity({ organizationId: org })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

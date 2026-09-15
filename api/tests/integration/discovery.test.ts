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
 const sibling = await provisioner.createNode({name: "Online", slug: `online-${node.id}`, kind: "city", tenantId: tenant.id});
 await editor.saveDiscoveryProfile({nodeId: node.id, ...profile});
 await editor.saveDiscoveryProfile({nodeId: sibling.id, ...profile, location: "", latitude: null, longitude: null});
 const records = await publicClient.listDiscovery({});
 expect(records.filter((r) => [node.id, sibling.id].includes(r.nodeId))).toHaveLength(2);
 expect(Object.keys(records.find((r) => r.nodeId === node.id)!)).not.toEqual(expect.arrayContaining(["actorId", "history", "metadata"]));
 await expect(editor.saveDiscoveryProfile({nodeId: node.id, ...profile, longitude: null})).rejects.toMatchObject({code: "BAD_REQUEST"});
});

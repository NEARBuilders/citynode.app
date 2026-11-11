import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, orgContext } from "../setup";

vi.mock("@/services/staking-pools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/staking-pools")>()),
  makeStakingPools: () => ({ isApproved: () => Effect.succeed(true) }),
}));

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const ORG = "bulletin-attribution-org";

function managerContext(userId: string, name: string) {
  const context = orgContext(userId, ORG, "owner");
  return { ...context, user: { ...(context.user as Record<string, unknown>), name } };
}

async function seedCommunity() {
  const owner = await getPluginClient(
    daoContext("bulletin-attribution-owner", ORG, "admin-bulletin-owner.near"),
  );
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await owner.createTenant({
    name: "New York City",
    accountId: `bulletin-${suffix}.near`,
  });
  const node = await owner.createNode({
    name: "New York City",
    kind: "city",
    slug: `bulletin-${suffix}`,
    tenantId: tenant.id,
  });
  return { tenant, node };
}

describe("bulletin attribution through the API", () => {
  it("records the signed-in publisher and ignores attribution sent by the client", async () => {
    const { node } = await seedCommunity();
    const ada = await getPluginClient(managerContext("bulletin-ada", "Ada Lovelace"));

    const before = Date.now();
    const published = await ada.setNodeBulletin({
      nodeId: node.id,
      bulletin: "Hackathon",
      bulletinPublisherName: "Mallory",
      bulletinPublishedAt: "2000-01-01T00:00:00.000Z",
    } as Parameters<typeof ada.setNodeBulletin>[0]);

    expect(published.bulletinPublisherName).toBe("Ada Lovelace");
    expect(Date.parse(published.bulletinPublishedAt ?? "")).toBeGreaterThanOrEqual(before - 1000);
    expect(await ada.getNode({ nodeId: node.id })).toMatchObject({
      bulletinPublisherName: "Ada Lovelace",
      bulletinPublishedAt: published.bulletinPublishedAt,
    });

    const cleared = await ada.setNodeBulletin({ nodeId: node.id, bulletin: null });
    expect(cleared.bulletinPublishedAt).toBeNull();
    expect(cleared.bulletinPublisherName).toBeNull();
  });

  it("never stores an email address as the publisher name", async () => {
    const { node } = await seedCommunity();
    const client = await getPluginClient(managerContext("bulletin-email", "ada@example.com"));

    const published = await client.setNodeBulletin({ nodeId: node.id, bulletin: "Hackathon" });
    expect(published.bulletinPublishedAt).not.toBeNull();
    expect(published.bulletinPublisherName).toBeNull();
  });

  it("attributes bulletins written through updateNode and createNode to the session, not to metadata", async () => {
    const { tenant, node } = await seedCommunity();
    const grace = await getPluginClient(managerContext("bulletin-grace", "Grace Hopper"));

    const updated = await grace.updateNode({
      nodeId: node.id,
      metadata: { bulletin: "Hackathon", bulletinPublisherName: "Mallory" },
    });
    expect(updated.bulletinPublisherName).toBe("Grace Hopper");
    expect(updated.bulletinPublishedAt).not.toBeNull();

    const created = await grace.createNode({
      name: "Brooklyn",
      kind: "city",
      slug: `brooklyn-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: tenant.id,
      parentId: node.id,
      metadata: { bulletin: "Welcome", bulletinPublishedAt: "2000-01-01T00:00:00.000Z" },
    });
    expect(created.bulletinPublisherName).toBe("Grace Hopper");
    expect(created.bulletinPublishedAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(Date.parse(created.bulletinPublishedAt ?? "")).toBeGreaterThan(
      Date.parse("2020-01-01T00:00:00.000Z"),
    );
  });

  it("shows the publisher name only to signed-in readers", async () => {
    const { tenant, node } = await seedCommunity();
    const ada = await getPluginClient(managerContext("bulletin-reader-ada", "Ada Lovelace"));
    const published = await ada.setNodeBulletin({ nodeId: node.id, bulletin: "Hackathon" });

    const visitor = await getPluginClient();
    const reads = [
      await visitor.getNode({ nodeId: node.id }),
      (await visitor.listNodes({ tenantId: tenant.id })).find(({ id }) => id === node.id),
      await visitor.resolveNodeBySlug({ slug: node.slug, parentId: null }),
      (await visitor.getNodeSummary({ nodeId: node.id })).node,
      (await visitor.listRootNodes()).find(({ id }) => id === node.id),
      (await visitor.listNodeSummaries({ scope: "roots" })).find(
        (summary) => summary.node.id === node.id,
      )?.node,
    ];
    for (const read of reads) {
      expect(read).toMatchObject({
        bulletinPublishedAt: published.bulletinPublishedAt,
        bulletinPublisherName: null,
      });
    }

    const member = await getPluginClient(orgContext("bulletin-member", ORG, "member"));
    expect(await member.getNode({ nodeId: node.id })).toMatchObject({
      bulletinPublisherName: "Ada Lovelace",
    });
  });
});

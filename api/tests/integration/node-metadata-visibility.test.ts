import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { nodes as nodesTable } from "@/db/schema";
import { nodesTestingDatabase } from "@/services/nodes";
import { activateTestNode, authedContext, daoContext, getPluginClient, orgContext } from "../setup";

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

type Client = Awaited<ReturnType<typeof getPluginClient>>;
type NodeRead = { id: string; metadata: Record<string, unknown> } | null | undefined;

async function seedCommunity(org: string) {
  const owner = await getPluginClient(
    daoContext(`${org}-owner`, org, `${org.slice(0, 20)}-owner.near`),
  );
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await owner.createTenant({
    name: "New York City",
    accountId: `visibility-${suffix}.near`,
  });
  const { node } = await activateTestNode({
    name: "New York City",
    kind: "city",
    slug: `visibility-${suffix}`,
    tenantId: tenant.id,
    orgId: org,
  });
  const editor = await getPluginClient(orgContext(`${org}-editor`, org, "owner"));
  await editor.setNodeBulletin({ nodeId: node.id, bulletin: "Members meetup on Friday" });
  return { tenant, node };
}

async function readsOf(client: Client, nodeId: string, tenantId: string, slug: string) {
  return [
    await client.getNode({ nodeId }),
    (await client.listNodes({ tenantId })).find(({ id }) => id === nodeId),
    (await client.listNodeSummaries({ scope: "roots" })).find(
      (summary) => summary.node.id === nodeId,
    )?.node,
    await client.resolveNodeBySlug({ slug }),
    (await client.getNodeSummary({ nodeId })).node,
    (await client.listRootNodes()).find(({ id }) => id === nodeId),
  ] as NodeRead[];
}

describe("node metadata visibility", () => {
  it("never returns the join code and keeps the bulletin from people outside the community", async () => {
    const org = "visibility-outsiders-org";
    const { tenant, node } = await seedCommunity(org);
    const anonymous = await getPluginClient();
    const outsider = await getPluginClient(
      orgContext("visibility-outsider", "another-org", "owner"),
    );
    const signedInWithoutOrg = await getPluginClient(authedContext("visibility-no-org"));

    for (const client of [anonymous, outsider, signedInWithoutOrg]) {
      for (const read of await readsOf(client, node.id, tenant.id, node.slug)) {
        expect(read?.id).toBe(node.id);
        expect(read?.metadata.joinCodeId).toBeUndefined();
        expect(read?.metadata.bulletin).toBeUndefined();
        expect(read).toMatchObject({ bulletinPublishedAt: null, bulletinPublisherName: null });
      }
    }
  }, 120_000);

  it("shows the bulletin, but not the join code, to members and platform admins", async () => {
    const org = "visibility-members-org";
    const { tenant, node } = await seedCommunity(org);
    const activeMember = await getPluginClient(orgContext("visibility-member", org, "member"));
    const otherActiveOrg = await getPluginClient({
      ...orgContext("visibility-member-elsewhere", "another-org", "member"),
      organizations: [
        { id: "another-org", role: "member" },
        { id: org, role: "member" },
      ],
    });
    const admin = await getPluginClient(authedContext("visibility-admin", "admin"));

    for (const client of [activeMember, otherActiveOrg, admin]) {
      for (const read of await readsOf(client, node.id, tenant.id, node.slug)) {
        expect(read?.metadata.joinCodeId).toBeUndefined();
        expect(read?.metadata.bulletin).toBe("Members meetup on Friday");
        expect(read).toMatchObject({ bulletinPublisherName: "Test User" });
      }
    }
  }, 120_000);

  it("uses the tenant's organization for nodes without one of their own", async () => {
    const org = "visibility-tenant-org";
    const { tenant, node } = await seedCommunity(org);
    const db = nodesTestingDatabase.current;
    if (!db) throw new Error("nodes database is not ready");
    await db.update(nodesTable).set({ orgId: null }).where(eq(nodesTable.id, node.id));

    const member = await getPluginClient(orgContext("visibility-tenant-member", org, "member"));
    const outsider = await getPluginClient(
      orgContext("visibility-tenant-outsider", "another-org", "member"),
    );

    const [memberRead] = await member.listNodes({ tenantId: tenant.id });
    expect(memberRead?.metadata.bulletin).toBe("Members meetup on Friday");
    const [outsiderRead] = await outsider.listNodes({ tenantId: tenant.id });
    expect(outsiderRead?.metadata.bulletin).toBeUndefined();
  });
});

import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const ORG = "team-gating-org";

function teamContext(
  userId: string,
  options: {
    orgRole?: "owner" | "admin" | "member";
    userRole?: string;
    areas?: string[];
    active?: boolean;
    teams?: Array<{ id: string; name: string; areas: string[] }>;
  } = {},
) {
  const base = orgContext(userId, ORG, options.orgRole ?? "member", options.userRole);
  const team = { id: `team-${userId}`, name: "Finance", areas: options.areas ?? ["finance"] };
  const teams = options.teams ?? [team];
  return {
    ...base,
    organization: {
      ...(base.organization as Record<string, unknown>),
      teams,
      activeTeamId: options.active === false ? null : (teams[0]?.id ?? null),
    },
  };
}

/** A member who joined through an Onboarding Code: no Team and no Active Team. */
function plainMemberContext(userId: string) {
  return teamContext(userId, { teams: [] });
}

async function seedNode(org = ORG) {
  const owner = await getPluginClient(
    daoContext(`gating-owner-${org}`, org, "admin-gating-owner.near"),
  );
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await owner.createTenant({
    name: "Gating",
    accountId: `gating-${suffix}.near`,
  });
  return owner.createNode({
    name: "Gating",
    kind: "country",
    slug: `gating-${suffix}`,
    tenantId: tenant.id,
  });
}

async function seedValidator(nodeId: string) {
  const owner = await getPluginClient(teamContext("validator-seeder", { orgRole: "owner" }));
  const suffix = crypto.randomUUID().slice(0, 8);
  return owner.createValidator({
    nodeId,
    accountId: `seeded-${suffix}.pool.near`,
    network: "mainnet",
    protocol: "near",
    role: "community",
  });
}

describe("team area gating on node operations", () => {
  it("allows a team member whose active team is granted node-operations", async () => {
    const node = await seedNode();
    const client = await getPluginClient(teamContext("ops-member", { areas: ["node-operations"] }));

    await expect(client.updateNode({ nodeId: node.id, name: "Renamed" })).resolves.toMatchObject({
      name: "Renamed",
    });
  });

  it("rejects a team member whose active team lacks node-operations", async () => {
    const node = await seedNode();
    const client = await getPluginClient(teamContext("finance-member", { areas: ["finance"] }));

    await expect(client.updateNode({ nodeId: node.id, name: "Renamed" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { requiredPermissions: ["node-operations"], action: "switch-team" },
    });
    await expect(
      client.createValidator({
        nodeId: node.id,
        accountId: "gated.pool.near",
        network: "mainnet",
        protocol: "near",
        role: "community",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets organization owners and admins bypass team restrictions", async () => {
    const node = await seedNode();
    const owner = await getPluginClient(teamContext("org-owner", { orgRole: "owner" }));
    const admin = await getPluginClient(teamContext("org-admin", { orgRole: "admin" }));

    await expect(owner.updateNode({ nodeId: node.id, name: "Owner" })).resolves.toMatchObject({
      name: "Owner",
    });
    await expect(admin.updateNode({ nodeId: node.id, name: "Admin" })).resolves.toMatchObject({
      name: "Admin",
    });
  });

  it("lets platform admins bypass team restrictions", async () => {
    const node = await seedNode();
    const client = await getPluginClient(teamContext("platform-admin", { userRole: "admin" }));

    await expect(client.updateNode({ nodeId: node.id, name: "Platform" })).resolves.toMatchObject({
      name: "Platform",
    });
  });

  it("rejects a plain member with no team on every node and validator mutation", async () => {
    const node = await seedNode();
    const validator = await seedValidator(node.id);
    const client = await getPluginClient(plainMemberContext("plain-member"));
    const forbidden = { code: "FORBIDDEN", data: { requiredPermissions: ["node-operations"] } };

    await expect(client.updateNode({ nodeId: node.id, name: "Hijacked" })).rejects.toMatchObject(
      forbidden,
    );
    await expect(
      client.updateNode({ nodeId: node.id, metadata: { poolAccountId: "evil.poolv1.near" } }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      client.setNodeBulletin({ nodeId: node.id, bulletin: "Nope" }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      client.createValidator({
        nodeId: node.id,
        accountId: "evil.pool.near",
        network: "mainnet",
        protocol: "near",
        role: "community",
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      client.updateValidator({ validatorId: validator.id, accountId: "evil.pool.near" }),
    ).rejects.toMatchObject(forbidden);
    await expect(client.setDefaultValidator({ validatorId: validator.id })).rejects.toMatchObject(
      forbidden,
    );
    await expect(client.deleteValidator({ validatorId: validator.id })).rejects.toMatchObject(
      forbidden,
    );
    await expect(
      client.createNode({
        name: "Child",
        kind: "city",
        slug: `plain-child-${crypto.randomUUID().slice(0, 8)}`,
        tenantId: node.tenantId!,
        parentId: node.id,
      }),
    ).rejects.toMatchObject(forbidden);

    const owner = await getPluginClient(teamContext("plain-check-owner", { orgRole: "owner" }));
    await expect(owner.getNode({ nodeId: node.id })).resolves.toMatchObject({ name: "Gating" });
    await expect(owner.getValidator({ validatorId: validator.id })).resolves.toMatchObject({
      accountId: validator.accountId,
    });
  });

  it("rejects a member whose only team is not granted node-operations, active or not", async () => {
    const node = await seedNode();
    const eventTeam = { id: "event-team", name: "Event Team", areas: [] };
    const inactive = await getPluginClient(
      teamContext("event-attendee", { teams: [eventTeam], active: false }),
    );
    const active = await getPluginClient(
      teamContext("event-attendee-active", { teams: [eventTeam] }),
    );

    await expect(inactive.updateNode({ nodeId: node.id, name: "Nope" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(active.updateNode({ nodeId: node.id, name: "Nope" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { action: "switch-team" },
    });
  });

  it("allows a member with no active team who belongs to a team granted node-operations", async () => {
    const node = await seedNode();
    const client = await getPluginClient(
      teamContext("ops-member-inactive", { areas: ["node-operations"], active: false }),
    );

    await expect(client.updateNode({ nodeId: node.id, name: "Teamless" })).resolves.toMatchObject({
      name: "Teamless",
    });
  });

  it("lets a platform admin outside the organization manage the node", async () => {
    const node = await seedNode();
    const validator = await seedValidator(node.id);
    const client = await getPluginClient(authedContext("outside-platform-admin", "admin"));

    await expect(client.updateNode({ nodeId: node.id, name: "Platform" })).resolves.toMatchObject({
      name: "Platform",
    });
    await expect(client.setDefaultValidator({ validatorId: validator.id })).resolves.toBeTruthy();
  });

  it("rejects users without an active organization", async () => {
    const node = await seedNode();
    const client = await getPluginClient(authedContext("orgless-user"));

    await expect(client.updateNode({ nodeId: node.id, name: "Nope" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("keeps public node reads open", async () => {
    const node = await seedNode();
    const client = await getPluginClient();

    await expect(client.getNode({ nodeId: node.id })).resolves.toMatchObject({ id: node.id });
  });
});

describe("node parent authorization", () => {
  it("rejects moving a node under another organization's node", async () => {
    const node = await seedNode();
    const foreign = await seedNode("team-gating-foreign-org");
    const owner = await getPluginClient(teamContext("parent-owner", { orgRole: "owner" }));

    await expect(owner.updateNode({ nodeId: node.id, parentId: foreign.id })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(owner.getNode({ nodeId: node.id })).resolves.toMatchObject({ parentId: null });
  });

  it("rejects creating a node under another organization's node", async () => {
    const node = await seedNode();
    const foreign = await seedNode("team-gating-foreign-org");
    const owner = await getPluginClient(teamContext("create-parent-owner", { orgRole: "owner" }));

    await expect(
      owner.createNode({
        name: "Squatter",
        kind: "city",
        slug: `squatter-${crypto.randomUUID().slice(0, 8)}`,
        tenantId: node.tenantId!,
        parentId: foreign.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still allows a parent the caller's organization owns", async () => {
    const parent = await seedNode();
    const node = await seedNode();
    const owner = await getPluginClient(teamContext("own-parent-owner", { orgRole: "owner" }));

    await expect(owner.updateNode({ nodeId: node.id, parentId: parent.id })).resolves.toMatchObject(
      { parentId: parent.id },
    );
    await expect(
      owner.createNode({
        name: "Child",
        kind: "city",
        slug: `own-child-${crypto.randomUUID().slice(0, 8)}`,
        tenantId: parent.tenantId!,
        parentId: parent.id,
      }),
    ).resolves.toMatchObject({ parentId: parent.id });
  });
});

describe("updateNode metadata", () => {
  it("keeps the rest of the metadata on a kind-only update", async () => {
    const node = await seedNode();
    const owner = await getPluginClient(teamContext("kind-owner", { orgRole: "owner" }));

    await owner.updateNode({
      nodeId: node.id,
      metadata: { poolAccountId: "pool.poolv1.near", endowmentAccountId: "endow.near" },
    });
    await owner.setNodeBulletin({ nodeId: node.id, bulletin: "Hello" });
    const updated = await owner.updateNode({ nodeId: node.id, kind: "region" });

    expect(updated.kind).toBe("region");
    expect(updated.metadata).toMatchObject({
      kind: "region",
      poolAccountId: "pool.poolv1.near",
      endowmentAccountId: "endow.near",
      bulletin: "Hello",
    });
  });
});

describe("team area gating on setNodeBulletin", () => {
  it("allows a team member whose active team is granted node-operations", async () => {
    const node = await seedNode();
    const client = await getPluginClient(teamContext("ops-member", { areas: ["node-operations"] }));

    await expect(
      client.setNodeBulletin({ nodeId: node.id, bulletin: "More features coming soon." }),
    ).resolves.toMatchObject({ metadata: { bulletin: "More features coming soon." } });
  });

  it("rejects a team member whose active team lacks node-operations", async () => {
    const node = await seedNode();
    const client = await getPluginClient(teamContext("finance-member", { areas: ["finance"] }));

    await expect(
      client.setNodeBulletin({ nodeId: node.id, bulletin: "Nope" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { requiredPermissions: ["node-operations"], action: "switch-team" },
    });
  });

  it("rejects users without an active organization", async () => {
    const node = await seedNode();
    const client = await getPluginClient(authedContext("orgless-user"));

    await expect(
      client.setNodeBulletin({ nodeId: node.id, bulletin: "Nope" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("merges into metadata instead of replacing it, unlike updateNode", async () => {
    const node = await seedNode();
    const owner = await getPluginClient(teamContext("bulletin-owner", { orgRole: "owner" }));

    await owner.updateNode({ nodeId: node.id, metadata: { poolAccountId: "pool.poolv1.near" } });
    const withBulletin = await owner.setNodeBulletin({
      nodeId: node.id,
      bulletin: "More features coming soon.",
    });
    expect(withBulletin.metadata).toMatchObject({
      poolAccountId: "pool.poolv1.near",
      bulletin: "More features coming soon.",
    });

    const cleared = await owner.setNodeBulletin({ nodeId: node.id, bulletin: null });
    expect(cleared.metadata).toMatchObject({ poolAccountId: "pool.poolv1.near" });
    expect(cleared.metadata.bulletin).toBeUndefined();
  });
});

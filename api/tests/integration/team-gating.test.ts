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

const TEAM_DENIED = {
  code: "FORBIDDEN",
  message: "Ask an organization owner to add you to a team with node-operations.",
  data: { requiredPermissions: ["node-operations"] },
};

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

function childNodeInput(name: string, slugPrefix: string, tenantId: string, parentId: string) {
  return {
    name,
    kind: "city",
    slug: `${slugPrefix}-${crypto.randomUUID().slice(0, 8)}`,
    tenantId,
    parentId,
  };
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

    await expect(client.updateNode({ nodeId: node.id, name: "Renamed" })).rejects.toMatchObject(
      TEAM_DENIED,
    );
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
      client.createNode(childNodeInput("Child", "plain-child", node.tenantId!, node.id)),
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
    await expect(active.updateNode({ nodeId: node.id, name: "Nope" })).rejects.toMatchObject(
      TEAM_DENIED,
    );
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
      owner.createNode(childNodeInput("Squatter", "squatter", node.tenantId!, foreign.id)),
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
      owner.createNode(childNodeInput("Child", "own-child", parent.tenantId!, parent.id)),
    ).resolves.toMatchObject({ parentId: parent.id });
  });
  it("lets the node's owner detach it to the root", async () => {
    const parent = await seedNode();
    const node = await seedNode();
    const owner = await getPluginClient(teamContext("detach-owner", { orgRole: "owner" }));

    await owner.updateNode({ nodeId: node.id, parentId: parent.id });
    await expect(owner.updateNode({ nodeId: node.id, parentId: null })).resolves.toMatchObject({
      parentId: null,
    });
  });

  it("does not re-check an unchanged parent the caller cannot manage", async () => {
    const foreign = await seedNode("team-gating-foreign-org");
    const tenantNode = await seedNode();
    const platformAdmin = await getPluginClient(
      teamContext("reparent-platform-admin", { orgRole: "owner", userRole: "admin" }),
    );
    const child = await platformAdmin.createNode(
      childNodeInput("Linked City", "linked", tenantNode.tenantId!, foreign.id),
    );
    const owner = await getPluginClient(
      teamContext("unchanged-parent-owner", { orgRole: "owner" }),
    );

    await expect(
      owner.updateNode({ nodeId: child.id, parentId: foreign.id, name: "Linked City (renamed)" }),
    ).resolves.toMatchObject({ parentId: foreign.id, name: "Linked City (renamed)" });
    await expect(
      owner.updateNode({ nodeId: tenantNode.id, parentId: foreign.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    ).rejects.toMatchObject(TEAM_DENIED);
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

describe("node-operations through any team the member belongs to", () => {
  type Client = Awaited<ReturnType<typeof getPluginClient>>;
  type Fixture = { node: Awaited<ReturnType<typeof seedNode>>; validatorId: string };
  type Outcome = "allowed" | "team-denied" | "forbidden";

  const UNRELATED_ORG = "team-gating-unrelated-org";
  const opsTeam = { id: "team-node-ops", name: "Node Operator", areas: ["node-operations"] };
  const financeTeam = { id: "team-finance", name: "Finance", areas: ["finance"] };

  function withActiveTeam(context: ReturnType<typeof teamContext>, activeTeamId: string | null) {
    return { ...context, organization: { ...context.organization, activeTeamId } };
  }

  function apiKeyContext(userId: string) {
    const base = orgContext(userId, ORG, "member");
    return {
      ...base,
      apiKey: { id: `key-${userId}`, permissions: {} },
      organization: { ...(base.organization as Record<string, unknown>), member: null, teams: [] },
    };
  }

  function unrelatedOrgOpsMember(userId: string) {
    const base = orgContext(userId, UNRELATED_ORG, "member");
    return {
      ...base,
      organization: {
        ...(base.organization as Record<string, unknown>),
        teams: [opsTeam],
        activeTeamId: opsTeam.id,
      },
    };
  }

  const routes: Array<{
    name: string;
    run: (client: Client, fixture: Fixture) => Promise<unknown>;
    rolesOnly?: boolean;
  }> = [
    {
      name: "createNode",
      run: (client, { node }) =>
        client.createNode(childNodeInput("Child", "matrix-create", node.tenantId!, node.id)),
    },
    {
      name: "spawnNode",
      run: (client, { node }) =>
        client.spawnNode({
          name: "Spawned",
          slug: `matrix-spawn-${crypto.randomUUID().slice(0, 8)}`,
          tenantId: node.tenantId!,
          parentId: node.id,
        }),
    },
    {
      name: "updateNode",
      run: (client, { node }) => client.updateNode({ nodeId: node.id, name: "Renamed" }),
    },
    {
      name: "setNodeBulletin",
      run: (client, { node }) => client.setNodeBulletin({ nodeId: node.id, bulletin: "Hi" }),
    },
    {
      name: "deleteNode",
      run: (client, { node }) => client.deleteNode({ nodeId: node.id }),
      rolesOnly: true,
    },
    {
      name: "createValidator",
      run: (client, { node }) =>
        client.createValidator({
          nodeId: node.id,
          accountId: `matrix-${crypto.randomUUID().slice(0, 8)}.pool.near`,
          network: "mainnet",
          protocol: "near",
          role: "community",
        }),
    },
    {
      name: "updateValidator",
      run: (client, { validatorId }) =>
        client.updateValidator({
          validatorId,
          accountId: `matrix-${crypto.randomUUID().slice(0, 8)}.pool.near`,
        }),
    },
    {
      name: "setDefaultValidator",
      run: (client, { validatorId }) => client.setDefaultValidator({ validatorId }),
    },
    {
      name: "deleteValidator",
      run: (client, { validatorId }) => client.deleteValidator({ validatorId }),
    },
  ];

  const callers: Array<{
    name: string;
    context: (userId: string) => Record<string, unknown>;
    outcome: Outcome;
    rolesOnlyOutcome?: Outcome;
  }> = [
    {
      name: "an organization owner",
      context: (userId) => teamContext(userId, { orgRole: "owner", teams: [] }),
      outcome: "allowed",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "an organization admin",
      context: (userId) => teamContext(userId, { orgRole: "admin", teams: [] }),
      outcome: "allowed",
    },
    {
      name: "a platform admin who is a plain member",
      context: (userId) => teamContext(userId, { userRole: "admin", teams: [] }),
      outcome: "allowed",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a node-operations team member with another team active",
      context: (userId) =>
        withActiveTeam(teamContext(userId, { teams: [financeTeam, opsTeam] }), financeTeam.id),
      outcome: "allowed",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a node-operations team member with no active team",
      context: (userId) => teamContext(userId, { teams: [opsTeam], active: false }),
      outcome: "allowed",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a node-operations team member with that team active",
      context: (userId) => withActiveTeam(teamContext(userId, { teams: [opsTeam] }), opsTeam.id),
      outcome: "allowed",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a member with no team",
      context: (userId) => teamContext(userId, { teams: [] }),
      outcome: "team-denied",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a member whose teams lack node-operations",
      context: (userId) => teamContext(userId, { teams: [financeTeam] }),
      outcome: "team-denied",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a member who joined by Onboarding Code",
      context: plainMemberContext,
      outcome: "team-denied",
      rolesOnlyOutcome: "forbidden",
    },
    {
      name: "a node-operations team member of an unrelated organization",
      context: unrelatedOrgOpsMember,
      outcome: "forbidden",
    },
    {
      name: "an organization API key",
      context: apiKeyContext,
      outcome: "team-denied",
      rolesOnlyOutcome: "forbidden",
    },
  ];

  async function seedFixture(): Promise<Fixture> {
    const node = await seedNode();
    const validator = await seedValidator(node.id);
    return { node, validatorId: validator.id };
  }

  describe.each(callers)("$name", (caller) => {
    it.each(routes)("$name", async (route) => {
      const fixture = await seedFixture();
      const userId = `matrix-${route.name}-${crypto.randomUUID().slice(0, 8)}`;
      const client = await getPluginClient(caller.context(userId));
      const outcome = (route.rolesOnly && caller.rolesOnlyOutcome) || caller.outcome;
      const result = route.run(client, fixture);

      if (outcome === "allowed") {
        await expect(result).resolves.toBeTruthy();
      } else if (outcome === "team-denied") {
        await expect(result).rejects.toMatchObject(TEAM_DENIED);
      } else {
        await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });
  });

  it("does not let a node-operations grant in another organization reach this one", async () => {
    const fixture = await seedFixture();
    const client = await getPluginClient(unrelatedOrgOpsMember("unrelated-ops"));

    await expect(
      client.updateNode({ nodeId: fixture.node.id, name: "Hijacked" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This node does not belong to your organization",
    });
    await expect(
      client.setDefaultValidator({ validatorId: fixture.validatorId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This node's validators do not belong to your organization",
    });
    await expect(
      client.createNode(
        childNodeInput("Child", "unrelated", fixture.node.tenantId!, fixture.node.id),
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This tenant does not belong to your organization",
    });
  });
});

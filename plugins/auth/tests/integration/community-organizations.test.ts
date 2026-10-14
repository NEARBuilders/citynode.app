import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { DEFAULT_TEAMS } from "../../src/default-teams";
import { serializeTeamAreas } from "../../src/utils";
import { createTestHandlers, createTestOrg, createTestServices, createTestUser } from "../helpers";

describe("community organization provisioning", () => {
  let setup: Awaited<ReturnType<typeof createTestServices>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>;
  let proposer: Awaited<ReturnType<typeof createTestUser>>;
  let outsider: Awaited<ReturnType<typeof createTestUser>>;
  const accountId = "community-applicant.near";

  beforeAll(async () => {
    setup = await createTestServices();
    admin = await createTestUser(setup.services);
    proposer = await createTestUser(setup.services);
    outsider = await createTestUser(setup.services);
    await setup.services.db
      .update(schema.user)
      .set({ role: "admin" })
      .where(eq(schema.user.id, admin.userId));
    await setup.services.db.insert(schema.nearAccount).values({
      id: crypto.randomUUID(),
      userId: proposer.userId,
      accountId,
      network: "mainnet",
      publicKey: "ed25519:community-test",
      isPrimary: true,
      createdAt: new Date(),
    });
  }, 30000);

  afterAll(async () => {
    await setup.driver.close();
  });

  const request = {
    proposalId: "prop-community-chicago",
    name: "Chicago",
    slug: "chicago",
    proposerAccountId: accountId,
  };

  it("requires a platform admin and a matching linked applicant identity", async () => {
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    await expect(
      provision({ input: request, context: { reqHeaders: outsider.reqHeaders } }),
    ).rejects.toThrow();
    await expect(
      provision({
        input: { ...request, proposerUserId: outsider.userId },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toThrow(/linked NEAR identity/);
  });

  it("creates one organization with proposer owner and reviewer admin, then reuses it", async () => {
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    const input = { ...request, proposerUserId: proposer.userId };
    const first = await provision({ input, context: { reqHeaders: admin.reqHeaders } });
    expect(first).toMatchObject({
      id: `community-${request.proposalId}`,
      name: "Chicago",
      slug: "chicago",
      status: "active",
      requestedBy: proposer.userId,
    });
    const members = await setup.services.db.query.member.findMany({
      where: eq(schema.member.organizationId, first.id),
    });
    expect(members.map(({ userId, role }) => ({ userId, role }))).toEqual(
      expect.arrayContaining([
        { userId: proposer.userId, role: "owner" },
        { userId: admin.userId, role: "admin" },
      ]),
    );
    expect(members).toHaveLength(2);
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, first.id),
    });
    expect(teams).toHaveLength(3);
    await setup.services.db
      .delete(schema.team)
      .where(and(eq(schema.team.organizationId, first.id), eq(schema.team.name, "Community")));
    const second = await provision({ input, context: { reqHeaders: admin.reqHeaders } });
    expect(second.id).toBe(first.id);
    expect(
      await setup.services.db.query.member.findMany({
        where: eq(schema.member.organizationId, first.id),
      }),
    ).toHaveLength(2);
    expect(
      await setup.services.db.query.team.findMany({
        where: eq(schema.team.organizationId, first.id),
      }),
    ).toHaveLength(2);
  });

  it("launches an admin's own application with the same organization shape", async () => {
    const adminAccountId = "community-admin.near";
    await setup.services.db.insert(schema.nearAccount).values({
      id: crypto.randomUUID(),
      userId: admin.userId,
      accountId: adminAccountId,
      network: "mainnet",
      publicKey: "ed25519:community-admin-test",
      isPrimary: true,
      createdAt: new Date(),
    });
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    const input = {
      proposalId: "prop-community-lagos",
      name: "Lagos",
      slug: "lagos",
      proposerAccountId: adminAccountId,
      proposerUserId: admin.userId,
    };
    const organization = await provision({ input, context: { reqHeaders: admin.reqHeaders } });
    expect(organization).toMatchObject({
      id: "community-prop-community-lagos",
      status: "active",
      requestedBy: admin.userId,
    });
    const members = await setup.services.db.query.member.findMany({
      where: eq(schema.member.organizationId, organization.id),
    });
    expect(members.map(({ userId, role }) => ({ userId, role }))).toEqual([
      { userId: admin.userId, role: "owner" },
    ]);
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, organization.id),
    });
    expect(
      teams
        .map(({ name, metadata }) => ({ name, metadata }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(
      DEFAULT_TEAMS.map(({ name, areas }) => ({
        name,
        metadata: serializeTeamAreas([...areas]),
      })).sort((a, b) => a.name.localeCompare(b.name)),
    );
    const repeated = await provision({ input, context: { reqHeaders: admin.reqHeaders } });
    expect(repeated.id).toBe(organization.id);
    expect(
      await setup.services.db.query.member.findMany({
        where: eq(schema.member.organizationId, organization.id),
      }),
    ).toHaveLength(1);
    expect(
      await setup.services.db.query.team.findMany({
        where: eq(schema.team.organizationId, organization.id),
      }),
    ).toHaveLength(DEFAULT_TEAMS.length);
  });

  it("rejects a community slug already held by an unrelated organization", async () => {
    const existing = await createTestOrg(setup.services, outsider.userId, {
      name: "Existing Boston",
      slug: "boston",
    });
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    await expect(
      provision({
        input: { ...request, proposalId: "prop-boston", name: "Boston", slug: "boston" },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toThrow(/slug/);
    expect(
      await setup.services.db.query.organization.findFirst({
        where: eq(schema.organization.id, existing.id),
      }),
    ).toMatchObject({ status: "active" });
  });

  it("activates a legacy pending organization request without replacing it", async () => {
    const legacy = await createTestOrg(setup.services, proposer.userId, {
      name: "Founding Group",
      slug: "founding-group",
    });
    await setup.services.db
      .update(schema.organization)
      .set({ status: "pending", requestedBy: proposer.userId })
      .where(eq(schema.organization.id, legacy.id));
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    const activated = await provision({
      input: { ...request, proposalId: "prop-legacy", legacyOrgId: legacy.id },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(activated).toMatchObject({
      id: legacy.id,
      name: "Founding Group",
      slug: "founding-group",
      status: "active",
    });
    expect(
      await setup.services.db.query.team.findMany({
        where: eq(schema.team.organizationId, legacy.id),
      }),
    ).toHaveLength(3);
    await expect(
      provision({
        input: { ...request, proposalId: "prop-other", legacyOrgId: legacy.id },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toThrow(/another community application/);
  });

  it("rejects a legacy organization owned by someone else", async () => {
    const legacy = await createTestOrg(setup.services, outsider.userId);
    const provision = createTestHandlers(setup.services).communityOrganizations
      .provisionCommunityOrganization;
    await expect(
      provision({
        input: { ...request, proposalId: "prop-foreign", legacyOrgId: legacy.id },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toThrow(/does not own/);
  });
});

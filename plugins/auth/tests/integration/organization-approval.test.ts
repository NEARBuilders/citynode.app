import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { DEFAULT_TEAMS } from "../../src/default-teams";
import { parseTeamAreas } from "../../src/utils";
import { createTestHandlers, createTestOrg, createTestServices, createTestUser } from "../helpers";

let setup: Awaited<ReturnType<typeof createTestServices>>;
let admin: Awaited<ReturnType<typeof createTestUser>>;
beforeAll(async () => {
  setup = await createTestServices();
  admin = await createTestUser(setup.services);
  await setup.services.db
    .update(schema.user)
    .set({ role: "admin" })
    .where(eq(schema.user.id, admin.userId));
}, 30000);
afterAll(async () => {
  await setup.driver.close();
});

async function requestOrganization(user: Awaited<ReturnType<typeof createTestUser>>) {
  const response = await setup.services.auth.handler(
    new Request("http://localhost:3000/api/auth/organization/create", {
      method: "POST",
      headers: { ...user.reqHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Requested organization",
        slug: `request-${crypto.randomUUID()}`,
        status: "active",
        requestedBy: admin.userId,
        metadata: { isPersonal: true },
        keepCurrentActiveOrganization: false,
      }),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string; status: string; requestedBy: string };
}

describe("organization approval gate", () => {
  it("keeps raw self-service creation pending despite forged approval and personal metadata", async () => {
    const requester = await createTestUser(setup.services);
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: requester.personalOrgId },
    });
    const organization = await requestOrganization(requester);
    expect(organization).toMatchObject({ status: "pending", requestedBy: requester.userId });
    const session = await setup.services.db.query.session.findFirst({
      where: eq(schema.session.userId, requester.userId),
    });
    expect(session?.activeOrganizationId).toBe(requester.personalOrgId);
    await expect(
      setup.services.auth.api.setActiveOrganization({
        headers: requester.headers,
        body: { organizationId: organization.id },
      }),
    ).rejects.toThrow("approval");
    const stored = await setup.services.db.query.organization.findFirst({
      where: eq(schema.organization.id, organization.id),
    });
    await expect(
      setup.services.auth.api.setActiveOrganization({
        headers: requester.headers,
        body: { organizationSlug: stored!.slug },
      }),
    ).rejects.toThrow("approval");
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: null },
    });
    expect(
      (
        await setup.services.db.query.session.findFirst({
          where: eq(schema.session.userId, requester.userId),
        })
      )?.activeOrganizationId,
    ).toBeNull();
    await expect(
      setup.services.auth.api.createInvitation({
        headers: requester.headers,
        body: { organizationId: organization.id, email: "outsider@example.com", role: "member" },
      }),
    ).rejects.toThrow("approval");
    await setup.services.auth.api.updateOrganization({
      headers: requester.headers,
      body: {
        organizationId: organization.id,
        data: { name: "Changed name", status: "active", rejectionReason: "forged" } as never,
      },
    });
    expect(
      await setup.services.db.query.organization.findFirst({
        where: eq(schema.organization.id, organization.id),
      }),
    ).toMatchObject({ status: "pending", rejectionReason: null });
    const listed = await createTestHandlers(setup.services).organizations.listOrganizations({
      context: { reqHeaders: requester.reqHeaders },
    });
    expect(listed).toContainEqual(
      expect.objectContaining({ id: organization.id, status: "pending" }),
    );
    await setup.services.db
      .update(schema.session)
      .set({ activeOrganizationId: organization.id })
      .where(eq(schema.session.userId, requester.userId));
    const context = await createTestHandlers(setup.services).session.getContext({
      context: { reqHeaders: requester.reqHeaders },
    });
    expect(context.organization.activeOrganizationId).toBeNull();
    expect(context.organizations).not.toContainEqual(
      expect.objectContaining({ id: organization.id }),
    );
  });

  it("limits the review queue and decisions to platform admins", async () => {
    const requester = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services).organizationRequests;
    for (const reqHeaders of [undefined, requester.reqHeaders]) {
      await expect(
        handlers.listOrganizationRequests({ context: { reqHeaders } }),
      ).rejects.toThrow();
      await expect(
        handlers.reviewOrganization({
          input: { organizationId: organization.id, decision: "approve" },
          context: { reqHeaders },
        }),
      ).rejects.toThrow();
    }
    const queue = await handlers.listOrganizationRequests({
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(queue).toContainEqual(
      expect.objectContaining({
        id: organization.id,
        requestedBy: requester.userId,
        status: "pending",
      }),
    );
  });

  it("approves once, restores the creator as owner, and enables activation", async () => {
    const requester = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services).organizationRequests;
    await setup.services.db
      .update(schema.member)
      .set({ role: "member" })
      .where(eq(schema.member.organizationId, organization.id));
    const approved = await handlers.reviewOrganization({
      input: { organizationId: organization.id, decision: "approve" },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(approved).toMatchObject({ status: "active", rejectionReason: null });
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, organization.id),
    });
    expect(
      teams.map((team) => ({ name: team.name, areas: parseTeamAreas(team.metadata) })),
    ).toEqual(
      expect.arrayContaining(
        DEFAULT_TEAMS.map((team) => ({ name: team.name, areas: [...team.areas] })),
      ),
    );
    expect(teams).toHaveLength(3);
    expect(
      await setup.services.db.query.teamMember.findMany({
        where: (member, { inArray }) =>
          inArray(
            member.teamId,
            teams.map((team) => team.id),
          ),
      }),
    ).toHaveLength(0);
    expect(
      await setup.services.db.query.member.findFirst({
        where: and(
          eq(schema.member.organizationId, organization.id),
          eq(schema.member.userId, requester.userId),
        ),
      }),
    ).toMatchObject({ role: "owner" });
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: organization.id },
    });
    expect(
      (
        await setup.services.db.query.session.findFirst({
          where: eq(schema.session.userId, requester.userId),
        })
      )?.activeOrganizationId,
    ).toBe(organization.id);
    await expect(
      handlers.reviewOrganization({
        input: { organizationId: organization.id, decision: "reject", reason: "Late rejection" },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toThrow("no longer pending");
  });

  it("keeps edited and deleted default teams unchanged when an approved community is reactivated", async () => {
    const requester = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    await setup.services.db.insert(schema.team).values({
      id: crypto.randomUUID(),
      name: "Operations",
      organizationId: organization.id,
      metadata: '{"areas":["events"]}',
    });
    await createTestHandlers(setup.services).organizationRequests.reviewOrganization({
      input: { organizationId: organization.id, decision: "approve" },
      context: { reqHeaders: admin.reqHeaders },
    });
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, organization.id),
    });
    expect(teams).toHaveLength(3);
    expect(teams.find((team) => team.name === "Operations")?.metadata).toBe('{"areas":["events"]}');
    const treasury = teams.find((team) => team.name === "Treasury")!;
    await setup.services.db
      .update(schema.team)
      .set({ name: "Custom treasury", metadata: '{"areas":["stake"]}' })
      .where(eq(schema.team.id, treasury.id));
    await setup.services.db
      .delete(schema.team)
      .where(eq(schema.team.id, teams.find((team) => team.name === "Community")!.id));
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: organization.id },
    });
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: null },
    });
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: organization.id },
    });
    const teamsAfterReactivation = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, organization.id),
    });
    expect(teamsAfterReactivation).toHaveLength(2);
    expect(teamsAfterReactivation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: treasury.id,
          name: "Custom treasury",
          metadata: '{"areas":["stake"]}',
        }),
      ]),
    );
  });

  it("requires a rejection reason, exposes it to the requester, and keeps rejected orgs gated", async () => {
    const requester = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services);
    await expect(
      handlers.organizationRequests.reviewOrganization({
        input: { organizationId: organization.id, decision: "reject", reason: "   " },
        context: { reqHeaders: admin.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await handlers.organizationRequests.reviewOrganization({
      input: {
        organizationId: organization.id,
        decision: "reject",
        reason: "  Please provide a community purpose.  ",
      },
      context: { reqHeaders: admin.reqHeaders },
    });
    const listed = await handlers.organizations.listOrganizations({
      context: { reqHeaders: requester.reqHeaders },
    });
    expect(listed).toContainEqual(
      expect.objectContaining({
        id: organization.id,
        status: "rejected",
        rejectionReason: "Please provide a community purpose.",
      }),
    );
    await expect(
      setup.services.auth.api.setActiveOrganization({
        headers: requester.headers,
        body: { organizationId: organization.id },
      }),
    ).rejects.toThrow("approval");
    const queue = await handlers.organizationRequests.listOrganizationRequests({
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(queue).not.toContainEqual(expect.objectContaining({ id: organization.id }));
  });

  it("prevents an invitation from claiming an unapproved organization", async () => {
    const owner = await createTestUser(setup.services);
    const recipient = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const invitation = await setup.services.auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: organization.id, email: recipient.email, role: "member" },
    });
    await setup.services.db
      .update(schema.organization)
      .set({ status: "pending" })
      .where(eq(schema.organization.id, organization.id));
    await expect(
      setup.services.auth.api.acceptInvitation({
        headers: recipient.headers,
        body: { invitationId: invitation.id },
      }),
    ).rejects.toThrow("approval");
    expect(
      await setup.services.db.query.member.findFirst({
        where: and(
          eq(schema.member.organizationId, organization.id),
          eq(schema.member.userId, recipient.userId),
        ),
      }),
    ).toBeUndefined();
  });

  it("blocks onboarding code creation and redemption for unapproved organizations", async () => {
    const owner = await createTestUser(setup.services);
    const recipient = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const handlers = createTestHandlers(setup.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: {
        organizationId: organization.id,
        eventId: crypto.randomUUID(),
        eventName: "Community meetup",
      },
      context: { reqHeaders: owner.reqHeaders },
    });
    await setup.services.db
      .update(schema.organization)
      .set({ status: "pending" })
      .where(eq(schema.organization.id, organization.id));
    await expect(
      handlers.onboarding.createOnboardingCode({
        input: {
          organizationId: organization.id,
          eventId: crypto.randomUUID(),
          eventName: "Another meetup",
        },
        context: { reqHeaders: owner.reqHeaders },
      }),
    ).rejects.toThrow("approval");
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: recipient.reqHeaders },
      }),
    ).rejects.toThrow("approval");
    expect(
      await setup.services.db.query.member.findFirst({
        where: and(
          eq(schema.member.organizationId, organization.id),
          eq(schema.member.userId, recipient.userId),
        ),
      }),
    ).toBeUndefined();
  });

  it("keeps personal signup orgs active and outside the queue", async () => {
    const requester = await createTestUser(setup.services);
    const personal = await setup.services.db.query.organization.findFirst({
      where: eq(schema.organization.id, requester.personalOrgId),
    });
    expect(personal).toMatchObject({
      status: "active",
      requestedBy: null,
      metadata: JSON.stringify({ isPersonal: true }),
    });
    await setup.services.auth.api.setActiveOrganization({
      headers: requester.headers,
      body: { organizationId: requester.personalOrgId },
    });
    const queue = await createTestHandlers(
      setup.services,
    ).organizationRequests.listOrganizationRequests({ context: { reqHeaders: admin.reqHeaders } });
    expect(queue).not.toContainEqual(expect.objectContaining({ id: requester.personalOrgId }));
  });

  it.each([
    "pending",
    "rejected",
  ])("blocks direct member additions to %s organizations", async (status) => {
    const requester = await createTestUser(setup.services);
    const recipient = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services);
    if (status === "rejected") {
      await handlers.organizationRequests.reviewOrganization({
        input: { organizationId: organization.id, decision: "reject", reason: "Not approved" },
        context: { reqHeaders: admin.reqHeaders },
      });
    }
    for (const organizationId of [organization.id, undefined]) {
      await setup.services.db
        .update(schema.session)
        .set({ activeOrganizationId: organization.id })
        .where(eq(schema.session.userId, requester.userId));
      await expect(
        handlers.members.addMember({
          input: { userId: recipient.userId, role: "member", organizationId },
          context: { reqHeaders: requester.reqHeaders },
        }),
      ).rejects.toThrow("approval");
    }
    expect(
      await setup.services.db.query.member.findMany({
        where: eq(schema.member.organizationId, organization.id),
      }),
    ).toEqual([expect.objectContaining({ userId: requester.userId, role: "owner" })]);
  });

  it.each([
    "pending",
    "rejected",
  ])("rejects outsiders adding themselves to %s organizations without revealing the status", async (status) => {
    const requester = await createTestUser(setup.services);
    const outsider = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services);
    if (status === "rejected") {
      await handlers.organizationRequests.reviewOrganization({
        input: { organizationId: organization.id, decision: "reject", reason: "Not approved" },
        context: { reqHeaders: admin.reqHeaders },
      });
    }
    await expect(
      handlers.members.addMember({
        input: { userId: outsider.userId, role: "owner", organizationId: organization.id },
        context: { reqHeaders: outsider.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can add members",
    });
    expect(
      await setup.services.db.query.member.findMany({
        where: eq(schema.member.organizationId, organization.id),
      }),
    ).toEqual([expect.objectContaining({ userId: requester.userId, role: "owner" })]);
  });

  it("preserves an approved organization after the requester account is removed", async () => {
    const requester = await createTestUser(setup.services);
    const successor = await createTestUser(setup.services);
    const organization = await requestOrganization(requester);
    const handlers = createTestHandlers(setup.services);
    await handlers.organizationRequests.reviewOrganization({
      input: { organizationId: organization.id, decision: "approve" },
      context: { reqHeaders: admin.reqHeaders },
    });
    const successorMember = await handlers.members.addMember({
      input: { userId: successor.userId, role: "owner", organizationId: organization.id },
      context: { reqHeaders: requester.reqHeaders },
    });
    const team = await setup.services.auth.api.createTeam({
      headers: requester.headers,
      body: { organizationId: organization.id, name: "Shared team" },
    });
    await setup.services.auth.api.removeUser({
      headers: admin.headers,
      body: { userId: requester.userId },
    });
    expect(
      await setup.services.db.query.organization.findFirst({
        where: eq(schema.organization.id, organization.id),
      }),
    ).toMatchObject({ status: "active", requestedBy: null });
    expect(
      await setup.services.db.query.member.findFirst({
        where: eq(schema.member.id, successorMember.id),
      }),
    ).toMatchObject({ userId: successor.userId, role: "owner" });
    expect(
      await setup.services.db.query.team.findFirst({
        where: eq(schema.team.id, team.id),
      }),
    ).toMatchObject({ organizationId: organization.id });
    await setup.services.auth.api.setActiveOrganization({
      headers: successor.headers,
      body: { organizationId: organization.id },
    });
  });
});

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import {
  addTestMember,
  createTestHandlers,
  createTestOrg,
  createTestServices,
  createTestUser,
} from "../helpers";

let services: Awaited<ReturnType<typeof createTestServices>>;

beforeAll(async () => {
  services = await createTestServices();
}, 30000);

afterAll(async () => {
  await services.driver.close();
}, 30000);

function eventOf(title: string, eventId: string = crypto.randomUUID()) {
  return { eventId, eventName: title };
}

describe("onboarding handlers", () => {
  it("creates a code with an event team and returns the plaintext code once", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const result = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Launch Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(result.code).toHaveLength(43);
    expect(result.eventName).toBe("Launch Night");
    expect(result.maxUses).toBe(300);
    expect(result.usedCount).toBe(0);

    const team = await services.services.db.query.team.findFirst({
      where: and(eq(schema.team.organizationId, org.id), eq(schema.team.name, "Launch Night")),
    });
    expect(team?.id).toBe(result.teamId);

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(result.id);
    expect(listed[0]!.code).toBeUndefined();
  });

  it("feeds every code for the same event into one Event Team", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const launch = eventOf("Launch Night");

    const first = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const second = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(second.teamId).toBe(first.teamId);
    expect(second.eventId).toBe(launch.eventId);
  });

  it("starts a new station with its own join limit while the event's first one is still live", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const meetup = eventOf("Meetup");

    const first = await handlers.onboarding.createOnboardingCode({
      input: { ...meetup, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const second = await handlers.onboarding.createOnboardingCode({
      input: { ...meetup, organizationId: org.id, maxUses: 5 },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(second.id).not.toBe(first.id);
    expect(second.code).not.toBe(first.code);
    expect(second.maxUses).toBe(5);
    expect(second.teamId).toBe(first.teamId);

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    expect(listed.map((code: { id: string }) => code.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("gives two events with the same title separate Event Teams", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const monday = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Hack Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const friday = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Hack Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(friday.teamId).not.toBe(monday.teamId);
  });

  it("keeps feeding a renamed Event Team from its event", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const summit = eventOf("Summit");

    const first = await handlers.onboarding.createOnboardingCode({
      input: { ...summit, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await handlers.teams.updateTeam({
      input: { teamId: first.teamId, organizationId: org.id, data: { name: "Summit 2026 cohort" } },
      context: { reqHeaders: owner.reqHeaders },
    });
    const second = await handlers.onboarding.createOnboardingCode({
      input: { ...summit, eventName: "Summit (renamed in Luma)", organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(second.teamId).toBe(first.teamId);
    expect(second.eventName).toBe("Summit (renamed in Luma)");
  });

  it("onboards a new user into the organization and the event team", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Meetup"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    const newcomer = await createTestUser(services.services, { email: undefined });
    const result = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: newcomer.reqHeaders },
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRedeemed).toBe(false);
    expect(result.organizationId).toBe(org.id);
    expect(result.organizationName).toBe(org.name);
    expect(result.eventName).toBe("Meetup");

    const member = await services.services.db.query.member.findFirst({
      where: and(
        eq(schema.member.userId, newcomer.userId),
        eq(schema.member.organizationId, org.id),
      ),
    });
    expect(member?.role).toBe("member");

    const teamMember = await services.services.db.query.teamMember.findFirst({
      where: and(
        eq(schema.teamMember.teamId, code.teamId),
        eq(schema.teamMember.userId, newcomer.userId),
      ),
    });
    expect(teamMember).toBeTruthy();

    const session = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, newcomer.userId),
    });
    expect(session?.activeOrganizationId).toBe(org.id);
    expect(session?.activeTeamId).toBeNull();
  });

  it("leaves a scanning member's Active Team unchanged", async () => {
    const { owner, org, member, handlers } = await orgWithTeamMember(["node-operations"]);
    const [workspace] = await handlers.teams.listTeams({
      input: { organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await handlers.organizations.setActiveOrganization({
      input: { organizationId: org.id },
      context: { reqHeaders: member.reqHeaders },
    });
    await handlers.teams.setActiveTeam({
      input: { teamId: workspace!.id },
      context: { reqHeaders: member.reqHeaders },
    });
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Workspace Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });

    const context = await handlers.session.getContext({
      context: { reqHeaders: member.reqHeaders },
    });
    expect(context.organization.activeOrganizationId).toBe(org.id);
    expect(context.organization.activeTeamId).toBe(workspace!.id);

    await services.services.db
      .update(schema.onboardingCode)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, code.id));
    const revisit = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });
    expect(revisit.alreadyRedeemed).toBe(true);
    const revisitContext = await handlers.session.getContext({
      context: { reqHeaders: member.reqHeaders },
    });
    expect(revisitContext.organization.activeTeamId).toBe(workspace!.id);
  });

  it("redeems idempotently without double-crediting the code", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Idempotent"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const newcomer = await createTestUser(services.services, { email: undefined });

    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: newcomer.reqHeaders },
    });
    const again = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: newcomer.reqHeaders },
    });

    expect(again.alreadyRedeemed).toBe(true);
    expect(again.organizationId).toBe(org.id);

    const drifted = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, newcomer.userId),
    });
    expect(drifted?.activeOrganizationId).toBe(org.id);

    await services.services.db
      .update(schema.session)
      .set({ activeOrganizationId: null })
      .where(eq(schema.session.userId, newcomer.userId));

    const revisit = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: newcomer.reqHeaders },
    });
    expect(revisit.alreadyRedeemed).toBe(true);

    const session = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, newcomer.userId),
    });
    expect(session?.activeOrganizationId).toBe(org.id);

    const status = await handlers.onboarding.getOnboardingStatus({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    expect(status.usedCount).toBe(1);
    expect(status.joined).toHaveLength(1);
    expect(status.joined[0]!.userName).toBe(newcomer.name);
  });

  it("enforces the use cap", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Solo"), organizationId: org.id, maxUses: 1 },
      context: { reqHeaders: owner.reqHeaders },
    });

    const first = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: first.reqHeaders },
    });

    const second = await createTestUser(services.services, { email: undefined });
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: second.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "code_used_up" },
    });

    const member = await services.services.db.query.member.findFirst({
      where: and(eq(schema.member.userId, second.userId), eq(schema.member.organizationId, org.id)),
    });
    expect(member).toBeUndefined();
  });

  it("rejects a revoked code even for prior redeemers", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Revoked Later"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });

    await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/revoked/i);
  });

  it("recognizes a prior redeemer after the code expires", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Expired Later"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });
    await services.services.db
      .update(schema.onboardingCode)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, code.id));

    const again = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });

    expect(again.alreadyRedeemed).toBe(true);
    expect(again.eventName).toBe("Expired Later");
    const status = await handlers.onboarding.getOnboardingStatus({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    expect(status.usedCount).toBe(1);
  });

  it("rejects a removed member who revisits an expired code without changing their session", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Removed Later"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });
    const membership = await services.services.db.query.member.findFirst({
      where: and(eq(schema.member.userId, member.userId), eq(schema.member.organizationId, org.id)),
    });
    await handlers.members.removeMember({
      input: { memberIdOrEmail: membership!.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.session)
      .set({ activeOrganizationId: null })
      .where(eq(schema.session.userId, member.userId));
    await services.services.db
      .update(schema.onboardingCode)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, code.id));

    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/expired/i);

    const session = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, member.userId),
    });
    expect(session?.activeOrganizationId).toBeNull();
  });

  it("rejects a member who revisits a revoked code without changing their session", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Withdrawn Invite"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });
    await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.session)
      .set({ activeOrganizationId: null })
      .where(eq(schema.session.userId, member.userId));

    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/revoked/i);

    const session = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, member.userId),
    });
    expect(session?.activeOrganizationId).toBeNull();
  });

  it("rejects a removed member who revisits a used-up code without changing their session", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Single Seat"), organizationId: org.id, maxUses: 1 },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });
    const membership = await services.services.db.query.member.findFirst({
      where: and(eq(schema.member.userId, member.userId), eq(schema.member.organizationId, org.id)),
    });
    await handlers.members.removeMember({
      input: { memberIdOrEmail: membership!.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.session)
      .set({ activeOrganizationId: null })
      .where(eq(schema.session.userId, member.userId));

    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/reached its limit/i);

    const session = await services.services.db.query.session.findFirst({
      where: eq(schema.session.userId, member.userId),
    });
    expect(session?.activeOrganizationId).toBeNull();
  });

  it("recognizes a prior redeemer after the code is used up", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Full Room"), organizationId: org.id, maxUses: 1 },
      context: { reqHeaders: owner.reqHeaders },
    });
    const member = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });

    const again = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: member.reqHeaders },
    });

    expect(again.alreadyRedeemed).toBe(true);
    const status = await handlers.onboarding.getOnboardingStatus({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    expect(status.usedCount).toBe(1);
  });

  it("rejects expired and revoked codes", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const expired = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Past"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.onboardingCode)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, expired.id));

    const late = await createTestUser(services.services, { email: undefined });
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: expired.code },
        context: { reqHeaders: late.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "code_expired" },
    });

    const revoked = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Cancelled"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: revoked.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: revoked.code },
        context: { reqHeaders: late.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "code_revoked" },
    });
  });

  it("rejects unknown codes and reports status flags publicly", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const unknown = await handlers.onboarding.getOnboardingCodeInfo({
      input: { code: "not-a-real-code" },
      context: {},
    });
    expect(unknown).toBeNull();
    const stranger = await createTestUser(services.services, { email: undefined });
    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: "not-a-real-code" },
        context: { reqHeaders: stranger.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { reason: "code_not_found" },
    });

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Info Event"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const info = await handlers.onboarding.getOnboardingCodeInfo({
      input: { code: code.code },
      context: {},
    });
    expect(info?.organizationName).toBe(org.name);
    expect(info?.eventName).toBe("Info Event");
    expect(info?.inviterName).toBe(owner.name);
    expect(info?.expired).toBe(false);
    expect(info?.revoked).toBe(false);
    expect(info?.usedUp).toBe(false);
  });

  it("reports a used-up code publicly", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Tiny Room"), organizationId: org.id, maxUses: 1 },
      context: { reqHeaders: owner.reqHeaders },
    });
    const attendee = await createTestUser(services.services, { email: undefined });
    await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: attendee.reqHeaders },
    });

    const info = await handlers.onboarding.getOnboardingCodeInfo({
      input: { code: code.code },
      context: {},
    });

    expect(info?.usedUp).toBe(true);
  });

  it("forbids non-admins from creating codes", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const member = await createTestUser(services.services, { email: undefined });
    await addTestMember(services.services, org.id, member.userId, "member");
    const handlers = createTestHandlers(services.services);

    await expect(
      handlers.onboarding.createOnboardingCode({
        input: { ...eventOf("Rogue"), organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
  });

  it("adds an existing member to the event team without re-adding the membership", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const existing = await createTestUser(services.services, { email: undefined });
    await addTestMember(services.services, org.id, existing.userId, "member");

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Existing"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const result = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: existing.reqHeaders },
    });

    expect(result.success).toBe(true);

    const memberships = await services.services.db
      .select()
      .from(schema.member)
      .where(
        and(eq(schema.member.userId, existing.userId), eq(schema.member.organizationId, org.id)),
      );
    expect(memberships).toHaveLength(1);

    const teamMember = await services.services.db.query.teamMember.findFirst({
      where: and(
        eq(schema.teamMember.teamId, code.teamId),
        eq(schema.teamMember.userId, existing.userId),
      ),
    });
    expect(teamMember).toBeTruthy();
  });
});

async function orgWithTeamMember(areas: string[]) {
  const owner = await createTestUser(services.services);
  const org = await createTestOrg(services.services, owner.userId);
  const member = await createTestUser(services.services, { email: undefined });
  await addTestMember(services.services, org.id, member.userId, "member");
  const handlers = createTestHandlers(services.services);
  const team = await handlers.teams.createTeam({
    input: { name: "Crew", organizationId: org.id, areas },
    context: { reqHeaders: owner.reqHeaders },
  });
  await handlers.teams.addTeamMember({
    input: { teamId: team.id, userId: member.userId, organizationId: org.id },
    context: { reqHeaders: owner.reqHeaders },
  });
  return { owner, org, member, handlers };
}

describe("onboarding organizers", () => {
  it("lets an admin run onboarding", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const admin = await createTestUser(services.services, { email: undefined });
    await addTestMember(services.services, org.id, admin.userId, "admin");
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Admin Night"), organizationId: org.id },
      context: { reqHeaders: admin.reqHeaders },
    });

    expect(code.eventName).toBe("Admin Night");
  });

  it("lets a member of a Team granted events create, list and revoke codes", async () => {
    const { org, member, handlers } = await orgWithTeamMember(["events"]);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Crew Night"), organizationId: org.id },
      context: { reqHeaders: member.reqHeaders },
    });
    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id },
      context: { reqHeaders: member.reqHeaders },
    });
    const revoked = await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: code.id, organizationId: org.id },
      context: { reqHeaders: member.reqHeaders },
    });

    expect(listed.map((entry: { id: string }) => entry.id)).toEqual([code.id]);
    expect(revoked.success).toBe(true);
  });

  it("refuses a member whose Teams are not granted events", async () => {
    const { owner, org, member, handlers } = await orgWithTeamMember(["finance"]);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Finance Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    await expect(
      handlers.onboarding.createOnboardingCode({
        input: { ...eventOf("Finance Night"), organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
    await expect(
      handlers.onboarding.listOnboardingCodes({
        input: { organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
    await expect(
      handlers.onboarding.revokeOnboardingCode({
        input: { codeId: code.id, organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
    await expect(
      handlers.onboarding.getOnboardingStation({
        input: { codeId: code.id, organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
  });

  it("does not let an events Team in one organization organize another", async () => {
    const { member, handlers } = await orgWithTeamMember(["events"]);
    const otherOwner = await createTestUser(services.services);
    const other = await createTestOrg(services.services, otherOwner.userId);
    await addTestMember(services.services, other.id, member.userId, "member");

    await expect(
      handlers.onboarding.createOnboardingCode({
        input: { ...eventOf("Elsewhere"), organizationId: other.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
  });
});

describe("listing one event's onboarding codes", () => {
  it("finds an event's live code older than the organization's 100 newest codes", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const launch = eventOf("Launch Night");
    const live = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.onboardingCode)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(schema.onboardingCode.id, live.id));
    for (let index = 0; index < 100; index++) {
      await handlers.onboarding.createOnboardingCode({
        input: { ...eventOf(`Meetup ${index}`), organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
    }

    const newest = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const forEvent = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id, eventId: launch.eventId },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(newest).toHaveLength(100);
    expect(newest.some((code: { id: string }) => code.id === live.id)).toBe(false);
    expect(forEvent.map((code: { id: string }) => code.id)).toEqual([live.id]);
  });

  it("lists every code of an event, so an older live one isn't hidden by the cap", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const launch = eventOf("Launch Night");
    const live = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.onboardingCode)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(schema.onboardingCode.id, live.id));
    for (let index = 0; index < 100; index++) {
      const closed = await handlers.onboarding.createOnboardingCode({
        input: { ...launch, organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
      await handlers.onboarding.revokeOnboardingCode({
        input: { codeId: closed.id, organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
    }

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id, eventId: launch.eventId },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(listed).toHaveLength(101);
    expect(listed.at(-1)!.id).toBe(live.id);
    expect(listed.filter((code: { revokedAt: Date | null }) => !code.revokedAt)).toHaveLength(1);
  });

  it("lists only that event's codes, newest first, including closed ones", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const launch = eventOf("Launch Night");
    const first = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.onboardingCode)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, first.id));
    const second = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: second.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Other Night"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id, eventId: launch.eventId },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(listed.map((code: { id: string }) => code.id)).toEqual([second.id, first.id]);
    expect(listed[0]!.revokedAt).not.toBeNull();
    expect(listed[1]!.revokedAt).toBeNull();
  });

  it("does not list another organization's codes for the same event", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const otherOwner = await createTestUser(services.services);
    const other = await createTestOrg(services.services, otherOwner.userId);
    const handlers = createTestHandlers(services.services);
    const shared = eventOf("Shared Night");
    await handlers.onboarding.createOnboardingCode({
      input: { ...shared, organizationId: other.id },
      context: { reqHeaders: otherOwner.reqHeaders },
    });

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id, eventId: shared.eventId },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(listed).toEqual([]);
  });

  it("lets an events Team member filter by event and refuses other members", async () => {
    const { owner, org, member, handlers } = await orgWithTeamMember(["events"]);
    const launch = eventOf("Crew Night");
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...launch, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const finance = await orgWithTeamMember(["finance"]);

    const listed = await handlers.onboarding.listOnboardingCodes({
      input: { organizationId: org.id, eventId: launch.eventId },
      context: { reqHeaders: member.reqHeaders },
    });

    expect(listed.map((entry: { id: string }) => entry.id)).toEqual([code.id]);
    await expect(
      finance.handlers.onboarding.listOnboardingCodes({
        input: { organizationId: finance.org.id, eventId: launch.eventId },
        context: { reqHeaders: finance.member.reqHeaders },
      }),
    ).rejects.toThrow(/organizers/i);
  });
});

describe("onboarding station", () => {
  async function stationFixture(options: { maxUses?: number } = {}) {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const created = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Station Night"), organizationId: org.id, ...options },
      context: { reqHeaders: owner.reqHeaders },
    });
    const openStation = () =>
      handlers.onboarding.getOnboardingStation({
        input: { codeId: created.id, organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
    return { owner, org, handlers, created, openStation };
  }

  it("reopens an active code's QR for its organizer", async () => {
    const { created, openStation } = await stationFixture();

    const station = await openStation();

    expect(station.code).toBe(created.code);
    expect(station.eventName).toBe("Station Night");
  });

  it("stores the raw code only encrypted at rest", async () => {
    const { created } = await stationFixture();

    const row = await services.services.db.query.onboardingCode.findFirst({
      where: eq(schema.onboardingCode.id, created.id),
    });

    expect(row?.encryptedCode).toBeTruthy();
    expect(row?.encryptedCode).not.toContain(created.code);
  });

  it("refuses to reveal a revoked code", async () => {
    const { org, owner, handlers, created, openStation } = await stationFixture();
    await handlers.onboarding.revokeOnboardingCode({
      input: { codeId: created.id, organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    await expect(openStation()).rejects.toThrow(/no longer active/i);
  });

  it("refuses to reveal an expired code", async () => {
    const { created, openStation } = await stationFixture();
    await services.services.db
      .update(schema.onboardingCode)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.onboardingCode.id, created.id));

    await expect(openStation()).rejects.toThrow(/no longer active/i);
  });

  it("refuses to reveal a used-up code", async () => {
    const { created, openStation } = await stationFixture({ maxUses: 1 });
    const attendee = await createTestUser(services.services, { email: undefined });
    await createTestHandlers(services.services).onboarding.redeemOnboardingCode({
      input: { code: created.code },
      context: { reqHeaders: attendee.reqHeaders },
    });

    await expect(openStation()).rejects.toThrow(/no longer active/i);
  });

  it("does not reveal another organization's code", async () => {
    const { created } = await stationFixture();
    const stranger = await createTestUser(services.services);
    const strangerOrg = await createTestOrg(services.services, stranger.userId);

    await expect(
      createTestHandlers(services.services).onboarding.getOnboardingStation({
        input: { codeId: created.id, organizationId: strangerOrg.id },
        context: { reqHeaders: stranger.reqHeaders },
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("onboarding into a full organization", () => {
  it("fails with an organization-is-full message at the membership limit", async () => {
    const full = await createTestServices({ organizationMembershipLimit: 1 });
    try {
      const owner = await createTestUser(full.services);
      const org = await createTestOrg(full.services, owner.userId);
      const handlers = createTestHandlers(full.services);
      const code = await handlers.onboarding.createOnboardingCode({
        input: { ...eventOf("Packed Hall"), organizationId: org.id },
        context: { reqHeaders: owner.reqHeaders },
      });
      const attendee = await createTestUser(full.services, { email: undefined });

      await expect(
        handlers.onboarding.redeemOnboardingCode({
          input: { code: code.code },
          context: { reqHeaders: attendee.reqHeaders },
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { reason: "organization_full" },
      });
    } finally {
      await full.driver.close();
    }
  }, 30000);
});

describe("redeemOnboardingCode organization causes", () => {
  it("returns organization_not_active when the organization is pending", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Pending Hall"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db
      .update(schema.organization)
      .set({ status: "pending" })
      .where(eq(schema.organization.id, org.id));
    const attendee = await createTestUser(services.services, { email: undefined });

    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: attendee.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "organization_not_active" },
    });
  });

  it("returns organization_not_found when the organization row is missing", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { ...eventOf("Gone Hall"), organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    await services.services.db.execute(sql`SET session_replication_role = replica`);
    await services.services.db
      .delete(schema.organization)
      .where(eq(schema.organization.id, org.id));
    await services.services.db.execute(sql`SET session_replication_role = DEFAULT`);
    const attendee = await createTestUser(services.services, { email: undefined });

    await expect(
      handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: attendee.reqHeaders },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "organization_not_found" },
    });
  });
});

import { and, eq } from "drizzle-orm";
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

describe("onboarding handlers", () => {
  it("creates a code with an event team and returns the plaintext code once", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const result = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Launch Night", organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(result.code).toHaveLength(43);
    expect(result.eventName).toBe("Launch Night");
    expect(result.maxUses).toBe(50);
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

  it("reuses an existing team when the event name matches", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const first = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Launch Night", organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const second = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Launch Night", organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(second.teamId).toBe(first.teamId);
  });

  it("onboards a new user into the organization and the event team", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Meetup", organizationId: org.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    const newcomer = await createTestUser(services.services, { email: undefined });
    const result = await handlers.onboarding.redeemOnboardingCode({
      input: { code: code.code },
      context: { reqHeaders: newcomer.reqHeaders },
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRedeemed).toBe(false);
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
    expect(session?.activeTeamId).toBe(code.teamId);
  });

  it("redeems idempotently without double-crediting the code", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const code = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Idempotent", organizationId: org.id },
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
      input: { eventName: "Solo", organizationId: org.id, maxUses: 1 },
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
    ).rejects.toThrow(/reached its limit/i);

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
      input: { eventName: "Revoked Later", organizationId: org.id },
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

  it("rejects expired and revoked codes", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const expired = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Past", organizationId: org.id },
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
    ).rejects.toThrow(/expired/i);

    const revoked = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Cancelled", organizationId: org.id },
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
    ).rejects.toThrow(/revoked/i);
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

    const code = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Info Event", organizationId: org.id },
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
  });

  it("forbids non-admins from creating codes", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const member = await createTestUser(services.services, { email: undefined });
    await addTestMember(services.services, org.id, member.userId, "member");
    const handlers = createTestHandlers(services.services);

    await expect(
      handlers.onboarding.createOnboardingCode({
        input: { eventName: "Rogue", organizationId: org.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toThrow(/owners and admins/i);
  });

  it("adds an existing member to the event team without re-adding the membership", async () => {
    const owner = await createTestUser(services.services);
    const org = await createTestOrg(services.services, owner.userId);
    const handlers = createTestHandlers(services.services);

    const existing = await createTestUser(services.services, { email: undefined });
    await addTestMember(services.services, org.id, existing.userId, "member");

    const code = await handlers.onboarding.createOnboardingCode({
      input: { eventName: "Existing", organizationId: org.id },
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

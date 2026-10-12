import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import {
  addTestMember,
  createTestHandlers,
  createTestOrg,
  createTestServices,
  createTestUser,
} from "../helpers";

let setup: Awaited<ReturnType<typeof createTestServices>>;

beforeAll(async () => {
  setup = await createTestServices();
}, 30000);

afterAll(async () => {
  await setup.driver.close();
}, 30000);

const now = new Date();
const thisMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
const lastMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
const monthLabel = (time: number) => new Date(time).toISOString().slice(0, 7);
const hours = (start: number, count: number) => new Date(start + count * 3_600_000);

async function createCode(organizationId: string, createdBy: string, eventId: string | null) {
  const [team] = await setup.services.db
    .insert(schema.team)
    .values({ id: crypto.randomUUID(), name: "Crew", organizationId, createdAt: new Date() })
    .returning();
  const [code] = await setup.services.db
    .insert(schema.onboardingCode)
    .values({
      id: crypto.randomUUID(),
      codeHash: crypto.randomUUID(),
      organizationId,
      eventId,
      eventName: "Launch",
      teamId: team!.id,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdBy,
    })
    .returning();
  return code!.id;
}

async function redeem(codeId: string, userId: string, createdAt: Date, newMember = true) {
  await setup.services.db.insert(schema.onboardingRedemption).values({
    id: crypto.randomUUID(),
    codeId,
    userId,
    newMember,
    createdAt,
  });
}

async function makePlatformAdmin(userId: string) {
  await setup.services.db
    .update(schema.user)
    .set({ role: "admin" })
    .where(eq(schema.user.id, userId));
}

async function organizationWithTeamMember(areas: string[]) {
  const owner = await createTestUser(setup.services);
  const organization = await createTestOrg(setup.services, owner.userId);
  const member = await createTestUser(setup.services);
  await addTestMember(setup.services, organization.id, member.userId);
  const handlers = createTestHandlers(setup.services);
  const team = await handlers.teams.createTeam({
    input: { name: "Crew", organizationId: organization.id, areas },
    context: { reqHeaders: owner.reqHeaders },
  });
  await handlers.teams.addTeamMember({
    input: { teamId: team.id, userId: member.userId, organizationId: organization.id },
    context: { reqHeaders: owner.reqHeaders },
  });
  return { owner, organization, member, handlers };
}

describe("getOnboardingRedemptions", () => {
  it("counts distinct redeemers and new members of one organization for this and last UTC month", async () => {
    const owner = await createTestUser(setup.services);
    const harbor = await createTestOrg(setup.services, owner.userId);
    const market = await createTestOrg(setup.services, owner.userId);
    const launch = await createCode(harbor.id, owner.userId, crypto.randomUUID());
    const walkIn = await createCode(harbor.id, owner.userId, null);
    const marketLaunch = await createCode(market.id, owner.userId, crypto.randomUUID());
    const twice = await createTestUser(setup.services);
    const existing = await createTestUser(setup.services);
    const walkInOnly = await createTestUser(setup.services);
    const lastMonthNewcomer = await createTestUser(setup.services);
    const lastMonthRegular = await createTestUser(setup.services);
    const longAgo = await createTestUser(setup.services);
    const elsewhere = await createTestUser(setup.services);

    await redeem(launch, twice.userId, hours(thisMonthStart, 1));
    await redeem(walkIn, twice.userId, hours(thisMonthStart, 2), false);
    await redeem(launch, existing.userId, hours(thisMonthStart, 3), false);
    await redeem(walkIn, walkInOnly.userId, hours(thisMonthStart, 0));
    await redeem(launch, lastMonthNewcomer.userId, new Date(thisMonthStart - 1));
    await redeem(walkIn, lastMonthRegular.userId, new Date(lastMonthStart), false);
    await redeem(launch, longAgo.userId, new Date(lastMonthStart - 1));
    await redeem(marketLaunch, elsewhere.userId, hours(thisMonthStart, 1));

    const result = await createTestHandlers(
      setup.services,
    ).onboardingJoins.getOnboardingRedemptions({
      input: { organizationId: harbor.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(result).toEqual({
      thisMonth: { month: monthLabel(thisMonthStart), redeemed: 3, newMembers: 2 },
      lastMonth: { month: monthLabel(lastMonthStart), redeemed: 2, newMembers: 1 },
    });
  }, 30000);

  it("reports zero for months without redemptions", async () => {
    const owner = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    await createCode(organization.id, owner.userId, crypto.randomUUID());

    const result = await createTestHandlers(
      setup.services,
    ).onboardingJoins.getOnboardingRedemptions({
      input: { organizationId: organization.id },
      context: { reqHeaders: owner.reqHeaders },
    });

    expect(result).toEqual({
      thisMonth: { month: monthLabel(thisMonthStart), redeemed: 0, newMembers: 0 },
      lastMonth: { month: monthLabel(lastMonthStart), redeemed: 0, newMembers: 0 },
    });
  });

  it("lets admins and members of an events team read the counts", async () => {
    const { owner, organization, member, handlers } = await organizationWithTeamMember(["events"]);
    const admin = await createTestUser(setup.services);
    await addTestMember(setup.services, organization.id, admin.userId, "admin");
    const code = await createCode(organization.id, owner.userId, null);
    const newcomer = await createTestUser(setup.services);
    await redeem(code, newcomer.userId, hours(thisMonthStart, 1));

    for (const organizer of [admin, member]) {
      const result = await handlers.onboardingJoins.getOnboardingRedemptions({
        input: { organizationId: organization.id },
        context: { reqHeaders: organizer.reqHeaders },
      });
      expect(result.thisMonth).toMatchObject({ redeemed: 1, newMembers: 1 });
    }
  });

  it("rejects a member whose teams are not granted events", async () => {
    const { organization, member, handlers } = await organizationWithTeamMember(["finance"]);

    await expect(
      handlers.onboardingJoins.getOnboardingRedemptions({
        input: { organizationId: organization.id },
        context: { reqHeaders: member.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/organizers/i) });
  });

  it("rejects an organizer of another organization", async () => {
    const owner = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const { owner: otherOwner, member: otherOrganizer } = await organizationWithTeamMember([
      "events",
    ]);
    const handlers = createTestHandlers(setup.services);

    for (const outsider of [otherOwner, otherOrganizer]) {
      await expect(
        handlers.onboardingJoins.getOnboardingRedemptions({
          input: { organizationId: organization.id },
          context: { reqHeaders: outsider.reqHeaders },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("rejects a platform admin who is not a member of the organization", async () => {
    const owner = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const platformAdmin = await createTestUser(setup.services);
    await makePlatformAdmin(platformAdmin.userId);

    await expect(
      createTestHandlers(setup.services).onboardingJoins.getOnboardingRedemptions({
        input: { organizationId: organization.id },
        context: { reqHeaders: platformAdmin.reqHeaders },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects signed-out callers", async () => {
    await expect(
      createTestHandlers(setup.services).onboardingJoins.getOnboardingRedemptions({
        input: {},
        context: { reqHeaders: undefined },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
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
}, 30000);

async function createCode(organizationId: string, createdBy: string) {
  const now = new Date();
  const [team] = await setup.services.db
    .insert(schema.team)
    .values({ id: crypto.randomUUID(), name: "Event", organizationId, createdAt: now })
    .returning();
  const [code] = await setup.services.db
    .insert(schema.onboardingCode)
    .values({
      id: crypto.randomUUID(),
      codeHash: crypto.randomUUID(),
      organizationId,
      eventName: "Event",
      teamId: team!.id,
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdBy,
    })
    .returning();
  return code!.id;
}

async function redeem(codeId: string, userId: string, createdAt: string, newMember = true) {
  await setup.services.db.insert(schema.onboardingRedemption).values({
    id: crypto.randomUUID(),
    codeId,
    userId,
    newMember,
    createdAt: new Date(createdAt),
  });
}

function joinsFor(
  result: {
    organizations: Array<{ organizationId: string; redeemed: number; newMembers: number }>;
  },
  organizationId: string,
) {
  const entry = result.organizations.find((row) => row.organizationId === organizationId);
  return entry && { redeemed: entry.redeemed, newMembers: entry.newMembers };
}

describe("listOnboardingJoins", () => {
  it("counts distinct redeemers and new members per organization within a UTC calendar month", async () => {
    const owner = await createTestUser(setup.services);
    const harbor = await createTestOrg(setup.services, owner.userId);
    const market = await createTestOrg(setup.services, owner.userId);
    const quiet = await createTestOrg(setup.services, owner.userId);
    const harborLaunch = await createCode(harbor.id, owner.userId);
    const harborMixer = await createCode(harbor.id, owner.userId);
    const marketLaunch = await createCode(market.id, owner.userId);
    const both = await createTestUser(setup.services);
    const harborOnly = await createTestUser(setup.services);
    const lastMonth = await createTestUser(setup.services);
    const nextMonth = await createTestUser(setup.services);
    const regular = await createTestUser(setup.services);

    await redeem(harborLaunch, both.userId, "2031-03-01T00:00:00.000Z");
    await redeem(harborMixer, both.userId, "2031-03-20T12:00:00.000Z", false);
    await redeem(marketLaunch, both.userId, "2031-03-31T23:59:59.999Z");
    await redeem(harborMixer, harborOnly.userId, "2031-03-10T08:00:00.000Z");
    await redeem(harborLaunch, regular.userId, "2031-03-12T08:00:00.000Z", false);
    await redeem(harborLaunch, lastMonth.userId, "2031-02-28T23:59:59.999Z");
    await redeem(marketLaunch, nextMonth.userId, "2031-04-01T00:00:00.000Z");

    const handlers = createTestHandlers(setup.services).onboardingJoins;
    const march = await handlers.listOnboardingJoins({
      input: { month: "2031-03" },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(march.month).toBe("2031-03");
    expect(joinsFor(march, harbor.id)).toEqual({ redeemed: 3, newMembers: 2 });
    expect(joinsFor(march, market.id)).toEqual({ redeemed: 1, newMembers: 1 });
    expect(joinsFor(march, quiet.id)).toBeUndefined();
    expect(march.totals).toEqual({ redeemed: 3, newMembers: 2 });

    const february = await handlers.listOnboardingJoins({
      input: { month: "2031-02" },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(february.organizations).toEqual([
      { organizationId: harbor.id, redeemed: 1, newMembers: 1 },
    ]);
    expect(february.totals).toEqual({ redeemed: 1, newMembers: 1 });

    const april = await handlers.listOnboardingJoins({
      input: { month: "2031-04" },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(april.organizations).toEqual([
      { organizationId: market.id, redeemed: 1, newMembers: 1 },
    ]);

    const empty = await handlers.listOnboardingJoins({
      input: { month: "2030-12" },
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(empty).toEqual({
      month: "2030-12",
      totals: { redeemed: 0, newMembers: 0 },
      organizations: [],
    });
  }, 30000);

  it("defaults to the current UTC month", async () => {
    const result = await createTestHandlers(setup.services).onboardingJoins.listOnboardingJoins({
      input: {},
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(result.month).toBe(new Date().toISOString().slice(0, 7));
  });

  it("rejects signed-out callers and non-admins", async () => {
    const member = await createTestUser(setup.services);
    const handlers = createTestHandlers(setup.services).onboardingJoins;
    await expect(
      handlers.listOnboardingJoins({ input: {}, context: { reqHeaders: undefined } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      handlers.listOnboardingJoins({ input: {}, context: { reqHeaders: member.reqHeaders } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records whether a redemption brought in a new member", async () => {
    const owner = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const handlers = createTestHandlers(setup.services);
    const code = await handlers.onboarding.createOnboardingCode({
      input: { eventId: crypto.randomUUID(), eventName: "Launch", organizationId: organization.id },
      context: { reqHeaders: owner.reqHeaders },
    });
    const existing = await createTestUser(setup.services);
    await addTestMember(setup.services, organization.id, existing.userId);
    const newcomer = await createTestUser(setup.services);

    for (const person of [existing, newcomer]) {
      await handlers.onboarding.redeemOnboardingCode({
        input: { code: code.code },
        context: { reqHeaders: person.reqHeaders },
      });
    }

    const redemptions = await setup.services.db
      .select({
        userId: schema.onboardingRedemption.userId,
        newMember: schema.onboardingRedemption.newMember,
      })
      .from(schema.onboardingRedemption)
      .where(eq(schema.onboardingRedemption.codeId, code.id));
    expect(new Map(redemptions.map((row) => [row.userId, row.newMember]))).toEqual(
      new Map([
        [existing.userId, false],
        [newcomer.userId, true],
      ]),
    );

    const current = await handlers.onboardingJoins.listOnboardingJoins({
      input: {},
      context: { reqHeaders: admin.reqHeaders },
    });
    expect(joinsFor(current, organization.id)).toEqual({ redeemed: 2, newMembers: 1 });
  });

  it("backfills new_member from membership timing on existing redemptions", async () => {
    const owner = await createTestUser(setup.services);
    const organization = await createTestOrg(setup.services, owner.userId);
    const codeId = await createCode(organization.id, owner.userId);
    const redeemedAt = new Date("2031-05-10T12:00:00.000Z");
    const seconds = (offset: number) => new Date(redeemedAt.getTime() + offset * 1000);
    const scenarios = [
      { name: "joined in the same transaction", memberAt: seconds(0), expected: true },
      { name: "joined just before", memberAt: seconds(-5), expected: true },
      { name: "already a member", memberAt: seconds(-6), expected: false },
      { name: "rejoined after", memberAt: seconds(60), expected: null },
      { name: "removed since", memberAt: null, expected: null },
    ];
    const people = await Promise.all(
      scenarios.map(async (scenario) => ({
        ...scenario,
        user: await createTestUser(setup.services),
      })),
    );
    for (const person of people) {
      if (person.memberAt) {
        await setup.services.db.insert(schema.member).values({
          id: crypto.randomUUID(),
          organizationId: organization.id,
          userId: person.user.userId,
          role: "member",
          createdAt: person.memberAt,
        });
      }
      await setup.services.db.insert(schema.onboardingRedemption).values({
        id: crypto.randomUUID(),
        codeId,
        userId: person.user.userId,
        createdAt: redeemedAt,
      });
    }
    const [, backfill] = readFileSync(
      new URL("../../src/db/migrations/0012_onboarding-redemption-new-member.sql", import.meta.url),
      "utf8",
    ).split("--> statement-breakpoint");
    const readRows = async () => {
      const rows = await setup.services.db
        .select({
          userId: schema.onboardingRedemption.userId,
          newMember: schema.onboardingRedemption.newMember,
          version: sql<string>`${schema.onboardingRedemption}.xmin::text`,
        })
        .from(schema.onboardingRedemption)
        .where(
          and(
            eq(schema.onboardingRedemption.codeId, codeId),
            inArray(
              schema.onboardingRedemption.userId,
              people.map((person) => person.user.userId),
            ),
          ),
        );
      const byUser = new Map(rows.map((row) => [row.userId, row]));
      return Object.fromEntries(
        people.map((person) => [person.name, byUser.get(person.user.userId)!]),
      );
    };
    const before = await readRows();
    await setup.services.db.execute(sql.raw(backfill!));
    const after = await readRows();

    expect(
      Object.fromEntries(people.map((person) => [person.name, after[person.name]!.newMember])),
    ).toEqual(Object.fromEntries(people.map((person) => [person.name, person.expected])));
    expect(
      Object.fromEntries(
        people.map((person) => [
          person.name,
          after[person.name]!.version !== before[person.name]!.version,
        ]),
      ),
    ).toEqual(Object.fromEntries(people.map((person) => [person.name, person.expected !== null])));
  });
});

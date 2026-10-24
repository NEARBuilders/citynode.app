import { createHash, randomUUID } from "node:crypto";
import * as authSchema from "../../fixtures/auth/schema.ts";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";

export type OnboardingCodeFixture = "valid" | "expired" | "revoked" | "usedUp";

const HOUR = 3_600_000;

function rawCode() {
  return randomUUID().replaceAll("-", "");
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function openAuthDatabase() {
  const regressionEnv = computeRegressionEnv();
  return createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
}

export async function seedOnboardingCodes(): Promise<{
  organizationId: string;
  organizationName: string;
  eventName: string;
  codes: Record<OnboardingCodeFixture, string>;
}> {
  const { test, db, close } = await openAuthDatabase();
  try {
    const unique = randomUUID().slice(0, 8);
    const organizer = await test.saveUser(
      test.createUser({
        email: `regression-organizer-${unique}@citynode.test`,
        name: "Regression Organizer",
        emailVerified: true,
      }),
    );
    const organizationName = `regression-onboarding-${unique}`;
    const organization = await test.saveOrganization(
      test.createOrganization({ name: organizationName, slug: organizationName }),
    );
    const eventName = `Regression Night ${unique}`;
    const now = new Date();
    const [team] = await db
      .insert(authSchema.team)
      .values({
        id: randomUUID(),
        name: eventName,
        organizationId: organization.id,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const fixtures: Record<
      OnboardingCodeFixture,
      { expiresAt: Date; revokedAt: Date | null; usedCount: number }
    > = {
      valid: { expiresAt: new Date(now.getTime() + 24 * HOUR), revokedAt: null, usedCount: 0 },
      expired: { expiresAt: new Date(now.getTime() - HOUR), revokedAt: null, usedCount: 0 },
      revoked: { expiresAt: new Date(now.getTime() + 24 * HOUR), revokedAt: now, usedCount: 0 },
      usedUp: { expiresAt: new Date(now.getTime() + 24 * HOUR), revokedAt: null, usedCount: 5 },
    };
    const codes = {} as Record<OnboardingCodeFixture, string>;
    for (const [fixture, state] of Object.entries(fixtures) as Array<
      [OnboardingCodeFixture, (typeof fixtures)[OnboardingCodeFixture]]
    >) {
      const code = rawCode();
      codes[fixture] = code;
      await db.insert(authSchema.onboardingCode).values({
        id: randomUUID(),
        codeHash: hashCode(code),
        organizationId: organization.id,
        eventId: randomUUID(),
        eventName,
        teamId: team!.id,
        role: "member",
        maxUses: 5,
        usedCount: state.usedCount,
        expiresAt: state.expiresAt,
        revokedAt: state.revokedAt,
        createdBy: organizer.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { organizationId: organization.id, organizationName, eventName, codes };
  } finally {
    await close();
  }
}

export async function seedCommunityJoins(): Promise<{
  organizationId: string;
}> {
  const regressionEnv = computeRegressionEnv();
  const { test, db, close } = await createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
  try {
    const unique = randomUUID().slice(0, 8);
    const saveUser = (role: string) =>
      test.saveUser(
        test.createUser({
          email: `regression-${role}-${unique}@citynode.test`,
          name: `Regression ${role}`,
          emailVerified: true,
        }),
      );
    const organizer = await saveUser("organizer");
    const organizationName = `regression-joins-${unique}`;
    const organization = await test.saveOrganization(
      test.createOrganization({ name: organizationName, slug: organizationName }),
    );
    const now = new Date();
    const [team] = await db
      .insert(authSchema.team)
      .values({
        id: randomUUID(),
        name: `Regression Joins ${unique}`,
        organizationId: organization.id,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const createCode = async () => {
      const [code] = await db
        .insert(authSchema.onboardingCode)
        .values({
          id: randomUUID(),
          codeHash: createHash("sha256").update(rawCode()).digest("hex"),
          organizationId: organization.id,
          eventId: randomUUID(),
          eventName: team!.name,
          teamId: team!.id,
          role: "member",
          maxUses: 5,
          usedCount: 0,
          expiresAt: new Date(now.getTime() + 24 * HOUR),
          createdBy: organizer.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return code!.id;
    };
    const launch = await createCode();
    const mixer = await createCode();
    const twice = await saveUser("twice");
    const once = await saveUser("once");
    const earlier = await saveUser("earlier");
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    // `newMembers` is derived from the member row's createdAt (not a stored
    // flag): `twice` joined this month, `once` is a pre-existing member, and
    // `earlier` joined last month.
    const addMemberAt = (userId: string, createdAt: Date) =>
      db.insert(authSchema.member).values({
        id: randomUUID(),
        organizationId: organization.id,
        userId,
        role: "member",
        createdAt,
      });
    await addMemberAt(twice.id, now);
    await addMemberAt(once.id, lastMonth);
    await addMemberAt(earlier.id, lastMonth);
    const redeemed = (codeId: string, userId: string, createdAt: Date) => ({
      id: randomUUID(),
      codeId,
      userId,
      createdAt,
    });
    await db
      .insert(authSchema.onboardingRedemption)
      .values([
        redeemed(launch, twice.id, now),
        redeemed(mixer, twice.id, now),
        redeemed(mixer, once.id, now),
        redeemed(launch, earlier.id, lastMonth),
      ]);
    return { organizationId: organization.id };
  } finally {
    await close();
  }
}

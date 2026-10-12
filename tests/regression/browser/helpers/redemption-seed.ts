import { createHash, randomUUID } from "node:crypto";
import * as authSchema from "../../../../plugins/auth/src/db/schema.ts";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";

export async function seedOrganizationRedemptions(organizationId: string): Promise<void> {
  const regressionEnv = computeRegressionEnv();
  const { test, db, close } = await createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
  try {
    const unique = randomUUID().slice(0, 8);
    const saveUser = (label: string) =>
      test.saveUser(
        test.createUser({
          email: `regression-redeemer-${label}-${unique}@citynode.test`,
          name: `Regression ${label}`,
          emailVerified: true,
        }),
      );
    const organizer = await saveUser("organizer");
    const now = new Date();
    const [team] = await db
      .insert(authSchema.team)
      .values({
        id: randomUUID(),
        name: `Regression Redemptions ${unique}`,
        organizationId,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const createCode = async (eventId: string | null) => {
      const [code] = await db
        .insert(authSchema.onboardingCode)
        .values({
          id: randomUUID(),
          codeHash: createHash("sha256").update(randomUUID()).digest("hex"),
          organizationId,
          eventId,
          eventName: team!.name,
          teamId: team!.id,
          role: "member",
          maxUses: 5,
          usedCount: 0,
          expiresAt: new Date(now.getTime() + 86_400_000),
          createdBy: organizer.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return code!.id;
    };
    const launch = await createCode(randomUUID());
    const walkIn = await createCode(null);
    const twice = await saveUser("twice");
    const existing = await saveUser("existing");
    const earlier = await saveUser("earlier");
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const redeemed = (codeId: string, userId: string, createdAt: Date, newMember: boolean) => ({
      id: randomUUID(),
      codeId,
      userId,
      newMember,
      createdAt,
    });
    await db
      .insert(authSchema.onboardingRedemption)
      .values([
        redeemed(launch, twice.id, now, true),
        redeemed(walkIn, twice.id, now, false),
        redeemed(walkIn, existing.id, now, false),
        redeemed(launch, earlier.id, lastMonth, true),
      ]);
  } finally {
    await close();
  }
}

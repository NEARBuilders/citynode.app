import { createHash, randomUUID } from "node:crypto";
import * as authSchema from "../../fixtures/auth/schema.ts";
import { openAuthDatabase } from "./onboarding-seed.ts";

export async function seedOrganizationRedemptions(organizationId: string): Promise<void> {
  const { test, db, close } = await openAuthDatabase();
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
    // `newMembers` is derived from the member row's createdAt: `twice` joined
    // this month, `existing` is pre-existing, `earlier` joined last month.
    const addMemberAt = (userId: string, createdAt: Date) =>
      db.insert(authSchema.member).values({
        id: randomUUID(),
        organizationId,
        userId,
        role: "member",
        createdAt,
      });
    await addMemberAt(twice.id, now);
    await addMemberAt(existing.id, lastMonth);
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
        redeemed(walkIn, twice.id, now),
        redeemed(walkIn, existing.id, now),
        redeemed(launch, earlier.id, lastMonth),
      ]);
  } finally {
    await close();
  }
}

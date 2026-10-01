import type { Actor } from "@near-intents-agent-api/agents-core";
import { apiKeys, tenants, user } from "@near-intents-agent-api/database/schema";
import { sql } from "drizzle-orm";
import type { DatabaseDriver } from "./db";

export async function actorForSession(
  database: DatabaseDriver,
  userId: string,
  keyName = "session",
): Promise<Actor> {
  const keyId = `${userId}:${keyName}`;
  await database.db
    .insert(user)
    .values({ id: userId, name: userId, email: `${userId}@agents.local` })
    .onConflictDoNothing();
  await database.db
    .insert(tenants)
    .values({ id: userId, ownerUserId: userId })
    .onConflictDoNothing();
  await database.db
    .insert(apiKeys)
    .values({
      id: keyId,
      tenantId: userId,
      name: keyName,
      tokenHash: keyId,
      prefix: keyId.slice(0, 8),
      expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000),
    })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: { expiresAt: sql`now() + interval '30 days'` },
    });
  return { tenantId: userId, keyId };
}

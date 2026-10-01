import type { Actor } from "@near-intents-agent-api/agents-core";
import { tenants, user } from "@near-intents-agent-api/database/schema";
import { eq } from "drizzle-orm";
import type { DatabaseDriver } from "./db";

export async function actorForSession(
  database: DatabaseDriver,
  userId: string,
  keyId = "session",
): Promise<Actor> {
  const existing = await database.db.select().from(tenants).where(eq(tenants.id, userId));
  if (!existing.length) {
    await database.db
      .insert(user)
      .values({ id: userId, name: userId, email: `${userId}@agents.local` });
    await database.db.insert(tenants).values({ id: userId, ownerUserId: userId });
  }
  return { tenantId: userId, keyId };
}

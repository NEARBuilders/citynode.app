import type { Actor } from "@near-intents-agent-api/agents-core";
import { tenants, user } from "@near-intents-agent-api/database/schema";
import { eq } from "drizzle-orm";
import type { DatabaseDriver } from "./db";

/**
 * Session → actor mapping: the better-near-auth session user IS the tenant.
 * First agent activity provisions the tenant row (ownerUserId = user id) that
 * the domain schema's foreign keys expect. The session key id is the actor's
 * key identity; every domain authorization check runs against this actor.
 */
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

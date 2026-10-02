import { eq } from "drizzle-orm";
import type { Database } from "./db";
import * as schema from "./db/schema";
import { serializeTeamAreas } from "./utils";

export const DEFAULT_TEAMS = [
  { name: "Operations", areas: ["node-operations"] },
  { name: "Treasury", areas: ["finance", "stake"] },
  { name: "Community", areas: ["things", "events"] },
] as const;

export async function provisionDefaultTeams(db: Database, organizationId: string) {
  const [organization] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .for("update");
  if (!organization || organization.status !== "active" || organization.defaultTeamsProvisionedAt)
    return;
  const [personalUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, organization.slug));
  if (personalUser) return;
  const existing = await db
    .select()
    .from(schema.team)
    .where(eq(schema.team.organizationId, organizationId));
  for (const team of DEFAULT_TEAMS) {
    if (existing.some((stored) => stored.name === team.name)) continue;
    await db.insert(schema.team).values({
      id: crypto.randomUUID(),
      name: team.name,
      organizationId,
      metadata: serializeTeamAreas([...team.areas]),
    });
  }
  await db
    .update(schema.organization)
    .set({ defaultTeamsProvisionedAt: new Date() })
    .where(eq(schema.organization.id, organizationId));
}

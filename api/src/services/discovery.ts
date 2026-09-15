import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import type { Database } from "../db";
import { DatabaseTag } from "../db/layer";
import { discoveryHistory, discoveryProfiles, nodes, tenants } from "../db/schema";
import type { DiscoveryProfile } from "../discovery-contract";
import type { AuthContext } from "../lib/auth";

function createDiscovery(db: Database) {
  async function authorize(nodeId: string, context: AuthContext) {
    if (!context.userId || !context.user) throw new ORPCError("UNAUTHORIZED");
    const [record] = await db
      .select({ node: nodes, tenant: tenants })
      .from(nodes)
      .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
      .where(eq(nodes.id, nodeId));
    if (!record) throw new ORPCError("NOT_FOUND");
    if (context.user.role === "admin") return record;
    const org = context.organization;
    if (
      !record.tenant.orgId ||
      org?.activeOrganizationId !== record.tenant.orgId ||
      !["owner", "admin"].includes(org.member?.role ?? "")
    )
      throw new ORPCError("FORBIDDEN");
    return record;
  }
  async function list(input: { query?: string; region?: string }) {
    const rows = await db
      .select({ profile: discoveryProfiles.data, node: nodes })
      .from(discoveryProfiles)
      .innerJoin(nodes, eq(discoveryProfiles.nodeId, nodes.id))
      .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
      .where(eq(tenants.status, "active"));
    return rows
      .filter(
        ({ profile, node }) =>
          profile.published &&
          (!input.query ||
            `${node.name} ${profile.location}`.toLowerCase().includes(input.query.toLowerCase())) &&
          (!input.region || profile.region === input.region),
      )
      .map(({ profile, node }) => ({
        ...profile,
        name: node.name,
        slug: node.slug,
        parentId: node.parentId,
        kind: node.kind,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId));
  }
  return {
    list,
    get: async (nodeId: string) => (await list({})).find((p) => p.nodeId === nodeId) ?? null,
    profile: async (nodeId: string, context: AuthContext) => {
      await authorize(nodeId, context);
      const [row] = await db
        .select()
        .from(discoveryProfiles)
        .where(eq(discoveryProfiles.nodeId, nodeId));
      return row?.data ?? null;
    },
    saveProfile: async (input: DiscoveryProfile, context: AuthContext) => {
      await authorize(input.nodeId, context);
      await db.transaction(async (tx) => {
        await tx
          .insert(discoveryProfiles)
          .values({ nodeId: input.nodeId, data: input })
          .onConflictDoUpdate({ target: discoveryProfiles.nodeId, set: { data: input } });
        await tx.insert(discoveryHistory).values({
          nodeId: input.nodeId,
          targetId: input.nodeId,
          actorId: context.userId!,
          action: input.published ? "profile published" : "profile saved as draft",
        });
      });
      return input;
    },
  };
}
export class DiscoveryTag extends Context.Tag("api/Discovery")<
  DiscoveryTag,
  ReturnType<typeof createDiscovery>
>() {}
export const DiscoveryLive = Layer.effect(
  DiscoveryTag,
  Effect.gen(function* () {
    return createDiscovery(yield* DatabaseTag);
  }),
);

import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import type { Database } from "../db";
import { DatabaseTag } from "../db/layer";
import {
  discoveryActivities,
  discoveryHistory,
  discoveryProfiles,
  nodes,
  tenants,
} from "../db/schema";
import type { DiscoveryActivity, DiscoveryProfile } from "../discovery-contract";
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
  async function list(input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
  }) {
    const rows = await db
      .select({ profile: discoveryProfiles.data, node: nodes })
      .from(discoveryProfiles)
      .innerJoin(nodes, eq(discoveryProfiles.nodeId, nodes.id))
      .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
      .where(eq(tenants.status, "active"));
    const activities = (await db.select().from(discoveryActivities)).map((r) => r.data);
    const eligible = new Set(rows.filter((r) => r.profile.published).map((r) => r.node.id));
    const now = Date.now();
    const day = 86_400_000;
    return rows
      .filter(
        ({ profile, node }) =>
          profile.published &&
          (!input.query ||
            `${node.name} ${profile.location}`.toLowerCase().includes(input.query.toLowerCase())) &&
          (!input.region || profile.region === input.region),
      )
      .map(({ profile, node }) => {
        const content = activities.filter(
          (a) =>
            eligible.has(a.ownerNodeId) &&
            a.nodeIds.includes(node.id) &&
            a.status === "published" &&
            Date.parse(a.publishedAt) <= now,
        );
        const events = content
          .filter((a) => a.kind === "event" && Date.parse(a.endsAt!) >= now)
          .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
        const updates = content
          .filter((a) => a.kind === "social")
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        const upcoming = events.some((a) => Date.parse(a.startsAt!) <= now + 60 * day);
        const recent =
          updates.some((a) => Date.parse(a.publishedAt) >= now - 30 * day) ||
          content.some(
            (a) =>
              a.kind === "event" &&
              Date.parse(a.endsAt!) >= now - 30 * day &&
              Date.parse(a.startsAt!) <= now,
          );
        return {
          ...profile,
          active: upcoming || recent,
          upcoming,
          activityReason: upcoming
            ? "Upcoming or ongoing event"
            : recent
              ? "Community activity in the last 30 days"
              : "No recent updates",
          events: events
            .slice(0, 3)
            .map((a) => ({ ...a, nodeIds: a.nodeIds.filter((id) => eligible.has(id)) })),
          updates: updates.slice(0, 3),
          name: node.name,
          slug: node.slug,
          parentId: node.parentId,
          kind: node.kind,
        };
      })
      .filter((p) => (!input.active || p.active) && (!input.upcoming || p.upcoming))
      .sort((a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId));
  }
  async function activityById(id: string) {
    const [row] = await db.select().from(discoveryActivities).where(eq(discoveryActivities.id, id));
    return row?.data ?? null;
  }
  async function saveActivity(
    input: Omit<DiscoveryActivity, "id"> & { id?: string },
    context: AuthContext,
  ) {
    const previous = input.id ? await activityById(input.id) : null;
    if (input.id && !previous) throw new ORPCError("NOT_FOUND");
    await authorize(previous?.ownerNodeId ?? input.ownerNodeId, context);
    if (previous && (previous.ownerNodeId !== input.ownerNodeId || previous.kind !== input.kind))
      throw new ORPCError("BAD_REQUEST", { message: "Activity ownership and kind cannot change" });
    for (const nodeId of new Set(input.nodeIds)) {
      if (!previous?.nodeIds.includes(nodeId)) await authorize(nodeId, context);
    }
    const url = new URL(input.url);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    url.searchParams.sort();
    const data = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      nodeIds: [...new Set(input.nodeIds)],
      url: url.toString(),
    };
    const [duplicate] = await db
      .select()
      .from(discoveryActivities)
      .where(eq(discoveryActivities.canonicalUrl, data.url));
    if (duplicate && duplicate.id !== data.id)
      throw new ORPCError("BAD_REQUEST", { message: "This source URL already has an activity" });
    await db.transaction(async (tx) => {
      await tx
        .insert(discoveryActivities)
        .values({ id: data.id, ownerNodeId: data.ownerNodeId, canonicalUrl: data.url, data })
        .onConflictDoUpdate({
          target: discoveryActivities.id,
          set: { data, canonicalUrl: data.url },
        });
      await tx.insert(discoveryHistory).values({
        nodeId: data.ownerNodeId,
        targetId: data.id,
        actorId: context.userId!,
        action: `${data.kind} ${data.status}`,
      });
    });
    return data;
  }
  return {
    list,
    saveActivity,
    activities: async (nodeId: string, context: AuthContext) => {
      await authorize(nodeId, context);
      return (
        await db
          .select()
          .from(discoveryActivities)
          .where(eq(discoveryActivities.ownerNodeId, nodeId))
      ).map((r) => r.data);
    },
    activity: async (id: string) => {
      const activity = await activityById(id);
      if (!activity || activity.status === "draft" || Date.parse(activity.publishedAt) > Date.now())
        return null;
      const eligible = new Set((await list({})).map((p) => p.nodeId));
      return eligible.has(activity.ownerNodeId)
        ? { ...activity, nodeIds: activity.nodeIds.filter((id) => eligible.has(id)) }
        : null;
    },
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

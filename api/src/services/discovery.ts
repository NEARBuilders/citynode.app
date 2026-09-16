import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import type { Database } from "../db";
import { DatabaseTag } from "../db/layer";
import {
  discoveryActivities,
  discoveryCurators,
  discoveryFeatures,
  discoveryHistory,
  discoveryMeasurements,
  discoveryProfiles,
  discoveryReports,
  nodes,
  tenants,
} from "../db/schema";
import type {
  DiscoveryActivity,
  DiscoveryMeasurement,
  DiscoveryProfile,
} from "../discovery-contract";
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
  async function eligibleProfiles(ids?: string[]) {
    if (ids?.length === 0) return [];
    return db
      .select({ profile: discoveryProfiles.data, node: nodes })
      .from(discoveryProfiles)
      .innerJoin(nodes, eq(discoveryProfiles.nodeId, nodes.id))
      .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
      .where(
        and(
          eq(tenants.status, "active"),
          sql`${discoveryProfiles.data}->>'published' = 'true'`,
          ids ? inArray(nodes.id, ids) : undefined,
        ),
      );
  }
  async function eligibleProfile(nodeId: string | null) {
    return nodeId ? ((await eligibleProfiles([nodeId]))[0]?.profile ?? null) : null;
  }
  async function publicActivity(id: string) {
    const activity = await activityById(id);
    if (
      !activity ||
      activity.status === "draft" ||
      Date.parse(activity.publishedAt) > Date.now() ||
      !(await eligibleProfile(activity.ownerNodeId))
    )
      return null;
    const eligible = new Set((await eligibleProfiles(activity.nodeIds)).map((r) => r.node.id));
    return { ...activity, nodeIds: activity.nodeIds.filter((id) => eligible.has(id)) };
  }
  async function list(input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
    nodeId?: string;
  }) {
    const rows = await eligibleProfiles(input.nodeId ? [input.nodeId] : undefined);
    const activities = (
      await db
        .select({ data: discoveryActivities.data })
        .from(discoveryActivities)
        .innerJoin(discoveryProfiles, eq(discoveryActivities.ownerNodeId, discoveryProfiles.nodeId))
        .innerJoin(nodes, eq(nodes.id, discoveryProfiles.nodeId))
        .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
        .where(
          and(
            eq(tenants.status, "active"),
            sql`${discoveryProfiles.data}->>'published' = 'true'`,
            sql`${discoveryActivities.data}->>'status' = 'published'`,
            sql`(${discoveryActivities.data}->>'publishedAt')::timestamptz <= ${new Date(Date.now()).toISOString()}`,
            input.nodeId
              ? sql`${discoveryActivities.data}->'nodeIds' ? ${input.nodeId}`
              : undefined,
          ),
        )
    ).map((r) => r.data);
    const eligible = new Set(
      (input.nodeId
        ? await eligibleProfiles([...new Set(activities.flatMap((a) => a.nodeIds))])
        : rows
      ).map((r) => r.node.id),
    );
    const byNode = new Map<string, DiscoveryActivity[]>();
    for (const activity of activities)
      for (const id of activity.nodeIds) {
        const group = byNode.get(id) ?? [];
        group.push(activity);
        byNode.set(id, group);
      }
    const features = await db
      .select()
      .from(discoveryFeatures)
      .where(
        and(
          gte(discoveryFeatures.expiresAt, new Date(Date.now())),
          input.nodeId ? eq(discoveryFeatures.nodeId, input.nodeId) : undefined,
        ),
      );
    const featureLabels = new Map(features.map((f) => [f.nodeId, f.label]));
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
        const content = byNode.get(node.id) ?? [];
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
          featured: featureLabels.get(node.id) ?? null,
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
  function requireAdmin(context: AuthContext) {
    if (!context.userId || !context.user) throw new ORPCError("UNAUTHORIZED");
    if (context.user.role !== "admin") throw new ORPCError("FORBIDDEN");
  }
  async function requireCurator(context: AuthContext) {
    if (!context.userId || !context.user) throw new ORPCError("UNAUTHORIZED");
    if (context.user.role === "admin") return;
    const [grant] = await db
      .select()
      .from(discoveryCurators)
      .where(eq(discoveryCurators.userId, context.userId));
    if (!grant) throw new ORPCError("FORBIDDEN");
  }
  return {
    list,
    track: async (input: DiscoveryMeasurement, context: AuthContext) => {
      if (
        !input.consent ||
        context.user?.role === "admin" ||
        ["owner", "admin"].includes(context.organization?.member?.role ?? "")
      )
        return { accepted: false };
      if (
        context.userId &&
        (
          await db
            .select()
            .from(discoveryCurators)
            .where(eq(discoveryCurators.userId, context.userId))
        ).length
      )
        return { accepted: false };
      const now = Date.now();
      await db
        .delete(discoveryMeasurements)
        .where(lt(discoveryMeasurements.createdAt, new Date(now - 28 * 86400000)));
      if (input.kind !== "visit") {
        const [visit] = await db
          .select()
          .from(discoveryMeasurements)
          .where(eq(discoveryMeasurements.key, `${input.visitId}:visit`));
        if (
          !visit ||
          visit.createdAt.getTime() < now - 30 * 60000 ||
          visit.campaign !== input.campaign
        )
          return { accepted: false };
        const node = await eligibleProfile(input.nodeId);
        if (!node) return { accepted: false };
        if (input.kind === "channel" && !node.channels.some((c) => c.url === input.target))
          return { accepted: false };
        if (input.kind === "event") {
          const activity = await publicActivity(input.target);
          if (
            !activity ||
            activity.kind !== "event" ||
            activity.status !== "published" ||
            !activity.nodeIds.includes(node.nodeId)
          )
            return { accepted: false };
        }
      }
      const target = input.kind === "channel" || input.kind === "event" ? input.target : "";
      const key =
        input.kind === "visit"
          ? `${input.visitId}:visit`
          : `${input.visitId}:${input.kind}:${input.nodeId}:${target}`;
      await db
        .insert(discoveryMeasurements)
        .values({
          key,
          visitId: input.visitId,
          nodeId: input.kind === "visit" ? null : input.nodeId,
          campaign: input.campaign,
          kind: input.kind,
        })
        .onConflictDoNothing();
      return { accepted: true };
    },
    metrics: async (context: AuthContext) => {
      await requireCurator(context);
      const since = gte(discoveryMeasurements.createdAt, new Date(Date.now() - 28 * 86400000));
      const [totals] = await db
        .select({
          visits: sql<number>`count(distinct case when kind = 'visit' then visit_id end)::int`,
          activatedVisits: sql<number>`count(distinct case when kind in ('event', 'channel') then visit_id end)::int`,
        })
        .from(discoveryMeasurements)
        .where(since);
      const rows = await db
        .select({
          nodeId: discoveryMeasurements.nodeId,
          campaign: discoveryMeasurements.campaign,
          kind: discoveryMeasurements.kind,
          count: sql<number>`count(*)::int`,
        })
        .from(discoveryMeasurements)
        .where(since)
        .groupBy(
          discoveryMeasurements.nodeId,
          discoveryMeasurements.campaign,
          discoveryMeasurements.kind,
        );
      return { visits: totals?.visits ?? 0, activatedVisits: totals?.activatedVisits ?? 0, rows };
    },
    studio: async (context: AuthContext) => {
      await requireCurator(context);
      const isAdmin = context.user?.role === "admin";
      const reports = isAdmin
        ? await db
            .select()
            .from(discoveryReports)
            .orderBy(desc(discoveryReports.createdAt))
            .limit(200)
        : [];
      return {
        isAdmin,
        nodes: await list({}),
        curators: isAdmin ? (await db.select().from(discoveryCurators)).map((r) => r.userId) : [],
        reports: reports.map(({ token, ...r }) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      };
    },
    setCurator: async (input: { userId: string; enabled: boolean }, context: AuthContext) => {
      requireAdmin(context);
      if (input.enabled)
        await db.insert(discoveryCurators).values({ userId: input.userId }).onConflictDoNothing();
      else await db.delete(discoveryCurators).where(eq(discoveryCurators.userId, input.userId));
      return { success: true };
    },
    feature: async (
      input: { nodeId: string; label: string; expiresAt: string },
      context: AuthContext,
    ) => {
      await requireCurator(context);
      if (Date.parse(input.expiresAt) > Date.now() + 90 * 86400000)
        throw new ORPCError("BAD_REQUEST", { message: "Feature expiry must be within 90 days" });
      if (!(await eligibleProfile(input.nodeId))) throw new ORPCError("NOT_FOUND");
      const data = { ...input, expiresAt: new Date(input.expiresAt) };
      await db
        .insert(discoveryFeatures)
        .values(data)
        .onConflictDoUpdate({ target: discoveryFeatures.nodeId, set: data });
      return { success: true };
    },
    report: async (input: {
      targetId: string;
      kind: "profile" | "activity";
      reason: string;
      token: string;
    }) => {
      const activity = input.kind === "activity" ? await publicActivity(input.targetId) : null;
      const ownerNodeId = activity?.ownerNodeId ?? input.targetId;
      if (input.kind === "profile" ? !(await eligibleProfile(input.targetId)) : !activity)
        throw new ORPCError("NOT_FOUND");
      await db.transaction(async (tx) => {
        await tx
          .select({ id: nodes.id })
          .from(nodes)
          .where(eq(nodes.id, ownerNodeId))
          .for("update");
        const recent = await tx
          .select({ id: discoveryReports.id })
          .from(discoveryReports)
          .where(
            and(
              eq(discoveryReports.targetId, input.targetId),
              gte(discoveryReports.createdAt, new Date(Date.now() - 3600000)),
            ),
          )
          .limit(20);
        if (recent.length >= 20)
          throw new ORPCError("BAD_REQUEST", {
            message: "This content has already received many reports. Please try again later.",
          });
        await tx.insert(discoveryReports).values(input).onConflictDoNothing();
      });
      return { success: true };
    },
    moderate: async (
      input: { reportId: string; action: "dismiss" | "unpublish"; note: string },
      context: AuthContext,
    ) => {
      requireAdmin(context);
      const [report] = await db
        .select()
        .from(discoveryReports)
        .where(eq(discoveryReports.id, input.reportId));
      if (!report) throw new ORPCError("NOT_FOUND");
      await db.transaction(async (tx) => {
        if (input.action === "unpublish") {
          let ownerNodeId: string;
          if (report.kind === "profile") {
            const [row] = await tx
              .select()
              .from(discoveryProfiles)
              .where(eq(discoveryProfiles.nodeId, report.targetId));
            if (!row) throw new ORPCError("NOT_FOUND");
            ownerNodeId = row.nodeId;
            await tx
              .update(discoveryProfiles)
              .set({ data: { ...row.data, published: false } })
              .where(eq(discoveryProfiles.nodeId, report.targetId));
          } else {
            const [row] = await tx
              .select()
              .from(discoveryActivities)
              .where(eq(discoveryActivities.id, report.targetId));
            if (!row) throw new ORPCError("NOT_FOUND");
            ownerNodeId = row.ownerNodeId;
            await tx
              .update(discoveryActivities)
              .set({ data: { ...row.data, status: "draft" } })
              .where(eq(discoveryActivities.id, report.targetId));
          }
          await tx.insert(discoveryHistory).values({
            nodeId: ownerNodeId,
            targetId: report.targetId,
            actorId: context.userId!,
            action: "moderation: unpublish",
          });
        }
        await tx
          .update(discoveryReports)
          .set({ resolved: true, note: input.note })
          .where(eq(discoveryReports.id, report.id));
      });
      return { success: true };
    },
    history: async (nodeId: string, context: AuthContext) => {
      await authorize(nodeId, context);
      const rows = await db
        .select()
        .from(discoveryHistory)
        .where(eq(discoveryHistory.nodeId, nodeId))
        .orderBy(desc(discoveryHistory.recordedAt))
        .limit(100);
      return rows.map(({ nodeId: _, ...row }) => ({
        ...row,
        recordedAt: row.recordedAt.toISOString(),
      }));
    },
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
    activity: publicActivity,
    get: async (nodeId: string) => (await list({ nodeId }))[0] ?? null,
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

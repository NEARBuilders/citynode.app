import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
  type AnyColumn,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { Clock, Context, DateTime, Effect, Layer } from "effect";
import type { Database } from "../db";
import { DatabaseTag } from "../db/layer";
import {
  discoveryActivities,
  discoveryCurators,
  discoveryFeatures,
  discoveryHistory,
  discoveryLumaConnections,
  discoveryMeasurements,
  discoveryProfiles,
  discoveryReports,
  eventReports,
  monthlyReports,
  nodes,
  placeAliases as placeAliasesTable,
  places as placesTable,
  tenants,
} from "../db/schema";
import type {
  DiscoveryActivity,
  DiscoveryMeasurement,
  DiscoveryProfile,
  EventReport,
  MonthlyReportStats,
  NodeActivity,
  PublicActivity,
  StoredDiscoveryProfile,
} from "../discovery-contract";
import { EVENT_REPORT_FORM_VERSION } from "../discovery-contract";
import type { FeatureArea } from "../feature-areas";
import type { AuthPluginContext as AuthContext } from "../lib/auth-types.gen";
import { toOrpcError } from "../lib/errors";
import { slugify } from "../lib/slug";
import {
  firstReportMonth,
  isReportableMonth,
  type ReportMonthWindow,
  reportMonthWindow,
} from "../report-month";
import { resolveTeamAccess } from "../team-access-policy";
import { memberDisplayName } from "../team-join-policy";
import { profilePlace } from "./discovery-geocode";
import { createLumaCalendars, type LumaEvent } from "./discovery-luma";
import { lumaWebhookSchema, verifyLumaWebhook } from "./luma-webhook";
import { hasJoinCode, listedNode, nodeKindOf, PLATFORM_NODE_KIND } from "./nodes";
import { createPlaceMatcher, type PlaceMatcher } from "./place-match";

const EVENTS_AREA: FeatureArea = "events";

export type DiscoveryEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

export type MonthlyExternalStats = (target: {
  organizationId: string;
  month: string;
  window: ReportMonthWindow;
}) => DiscoveryEffect<Omit<MonthlyReportStats, "eventsHeld">>;

function storedMonthlyReport(row: typeof monthlyReports.$inferSelect, nodeId: string) {
  return {
    nodeId,
    month: row.month,
    notes: row.notes,
    stats: {
      eventsHeld: row.eventsHeld,
      checkIns: row.checkIns,
      joins: row.joins,
      newMembers: row.newMembers,
    },
    submittedBy: row.submittedBy,
    submittedByName: row.submittedByName,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function storedReport(row: typeof eventReports.$inferSelect) {
  return {
    activityId: row.activityId,
    formVersion: row.formVersion,
    report: row.report,
    source: row.source,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

const NOT_REVIEWED = { reviewedBy: null, reviewedAt: null };

const reviewPatch = (reviewed: boolean, userId: string, at: Date) =>
  reviewed ? { reviewedBy: userId, reviewedAt: at } : NOT_REVIEWED;

const readVersion = (column: AnyColumn, updatedAt: string) =>
  sql`date_trunc('milliseconds', ${column}) = ${new Date(updatedAt).toISOString()}::timestamptz`;

const reviewResult = ([row]: { reviewedAt: Date | null }[], exists: boolean) =>
  row
    ? Effect.succeed({ reviewedAt: row.reviewedAt?.toISOString() ?? null })
    : Effect.fail(
        exists
          ? new ORPCError("CONFLICT", { message: "This report changed since it was read" })
          : new ORPCError("NOT_FOUND"),
      );

function shownActivity(now: string) {
  const data = discoveryActivities.data;
  return and(
    sql`${data}->>'status' = 'published'`,
    sql`(${data}->>'publishedAt')::timestamptz <= ${now}`,
  );
}

function canonicalActivityUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  if (["lu.ma", "www.lu.ma", "www.luma.com"].includes(url.hostname)) url.hostname = "luma.com";
  for (const key of url.searchParams.keys())
    if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

const placeLabelByKind: Record<string, string> = {
  country: "country",
  state: "subdivision",
  city: "city",
};

async function matchCatalogPlace(
  db: Database,
  location: string,
  kind: string | null,
): Promise<{ id: string } | undefined> {
  const label = kind ? placeLabelByKind[kind] : undefined;
  const [matched] = await db
    .select({ id: placesTable.id })
    .from(placesTable)
    .where(
      and(
        sql`(${placesTable.slug} = ${slugify(location)} OR ${placesTable.id} IN (
          SELECT place_id FROM ${placeAliasesTable} WHERE value = ${location}
        ))`,
        label ? eq(placesTable.label, label) : undefined,
      ),
    )
    .limit(1);
  return matched;
}

export async function adoptCatalogPlace(
  db: Database,
  node: { id: string; placeId: string | null },
  place: string,
  kind: string | null,
): Promise<void> {
  const location = place.trim();
  if (!location) return;
  const matched = await matchCatalogPlace(db, location, kind);
  if (!matched || matched.id === node.placeId) return;
  const [taken] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.placeId, matched.id), sql`${nodes.id} <> ${node.id}`))
    .limit(1);
  if (taken) return;
  if (node.placeId !== null) {
    await db.update(nodes).set({ placeId: null }).where(eq(nodes.id, node.id));
  }
  await db
    .update(nodes)
    .set({ placeId: matched.id })
    .where(
      and(
        eq(nodes.id, node.id),
        isNull(nodes.placeId),
        sql`NOT EXISTS (SELECT 1 FROM ${nodes} AS taken WHERE taken.place_id = ${matched.id})`,
      ),
    );
}

function lumaVenue(event: LumaEvent) {
  return (
    (event.location_visibility === "public"
      ? event.geo_address_json?.full_address || event.geo_address_json?.city_state
      : null
    )?.slice(0, 240) || "See Luma for location details"
  );
}

function lumaVenueKey(event: LumaEvent) {
  const address = event.geo_address_json;
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.coordinate?.latitude ?? null,
        event.coordinate?.longitude ?? null,
        address?.full_address ?? null,
        address?.city ?? null,
        address?.region ?? null,
        address?.country ?? null,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function withdrawLumaRows(tx: Tx, rows: (typeof discoveryActivities.$inferSelect)[]) {
  if (rows.length === 0) return;
  const reported = new Set(
    (
      await tx
        .select({ id: eventReports.activityId })
        .from(eventReports)
        .where(
          inArray(
            eventReports.activityId,
            rows.map((row) => row.id),
          ),
        )
    ).map((row) => row.id),
  );
  for (const row of rows) {
    if (!reported.has(row.id)) {
      await tx.delete(discoveryActivities).where(eq(discoveryActivities.id, row.id));
      continue;
    }
    await tx
      .update(discoveryActivities)
      .set({
        data: {
          ...row.data,
          status: "draft",
          luma: row.data.luma && { ...row.data.luma, removed: true },
        },
      })
      .where(eq(discoveryActivities.id, row.id));
  }
}

function lumaStatus(previous: PublicActivity | undefined, cancel: boolean) {
  if (cancel || previous?.status === "cancelled") return "cancelled" as const;
  return previous?.status === "draft" && !previous.luma?.removed
    ? ("draft" as const)
    : ("published" as const);
}

function lumaPlaceActivityId(eventId: string) {
  const bytes = createHash("sha256").update(`luma-place-event:${eventId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DiscoveryConfig {
  lumaKeys?: string;
  lumaMainCalendarId?: string;
  lumaWebhookSecrets?: string;
}

const PLACE_TREE_TTL_MS = 5 * 60_000;
const PLACE_MATCHER_TTL_MS = 10 * 60_000;

function createDiscovery(db: Database, config: DiscoveryConfig) {
  const luma = createLumaCalendars(config.lumaKeys ?? "");
  const lumaMainCalendarId = config.lumaMainCalendarId?.trim() ?? "";
  const lumaWebhookSecrets = (config.lumaWebhookSecrets ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);

  const query = <T>(run: () => Promise<T>): DiscoveryEffect<T> =>
    Effect.tryPromise({ try: run, catch: toOrpcError });

  let placeParents: {
    loadedAt: number;
    parents: Map<string, string | null>;
    children: Map<string, string[]>;
  } | null = null;
  let placeMatcherCache: { loadedAt: number; matcher: PlaceMatcher } | null = null;

  const placeTree = Effect.fn("DiscoveryService.placeTree")(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (!placeParents || now - placeParents.loadedAt > PLACE_TREE_TTL_MS) {
      const rows = yield* query(() =>
        db.select({ id: placesTable.id, parentId: placesTable.parentId }).from(placesTable),
      );
      const children = new Map<string, string[]>();
      for (const row of rows)
        if (row.parentId)
          children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
      placeParents = {
        loadedAt: now,
        parents: new Map(rows.map((row) => [row.id, row.parentId] as const)),
        children,
      };
    }
    const { parents, children } = placeParents;
    const nodeRows = yield* query(() =>
      db
        .select({ id: nodes.id, placeId: nodes.placeId })
        .from(nodes)
        .where(isNotNull(nodes.placeId)),
    );
    const nodesByPlace = new Map<string, string[]>();
    const placeOfNode = new Map<string, string>();
    for (const row of nodeRows) {
      if (!row.placeId) continue;
      placeOfNode.set(row.id, row.placeId);
      nodesByPlace.set(row.placeId, [...(nodesByPlace.get(row.placeId) ?? []), row.id]);
    }
    const ancestors = (placeId: string) => {
      const chain: string[] = [];
      let cursor: string | null = placeId;
      while (cursor && !chain.includes(cursor)) {
        chain.push(cursor);
        cursor = parents.get(cursor) ?? null;
      }
      return chain;
    };
    const descendants = (placeId: string) => {
      const found = new Set([placeId]);
      const queue = [placeId];
      while (queue.length > 0)
        for (const child of children.get(queue.shift()!) ?? [])
          if (!found.has(child)) {
            found.add(child);
            queue.push(child);
          }
      return [...found];
    };
    return {
      placeOfNode,
      descendants,
      rollupNodeIds: (activity: PublicActivity) => {
        if (activity.kind !== "event") return [];
        const placeId =
          activity.placeId ??
          (activity.ownerNodeId ? placeOfNode.get(activity.ownerNodeId) : undefined);
        return placeId ? ancestors(placeId).flatMap((id) => nodesByPlace.get(id) ?? []) : [];
      },
    };
  });

  const placeMatcher = Effect.fn("DiscoveryService.placeMatcher")(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (placeMatcherCache && now - placeMatcherCache.loadedAt <= PLACE_MATCHER_TTL_MS)
      return placeMatcherCache.matcher;
    const [rows, aliases] = yield* Effect.all([
      query(() =>
        db
          .select({
            id: placesTable.id,
            parentId: placesTable.parentId,
            name: placesTable.name,
            label: placesTable.label,
            boundary: placesTable.boundary,
          })
          .from(placesTable),
      ),
      query(() =>
        db
          .select({ value: placeAliasesTable.value, placeId: placeAliasesTable.placeId })
          .from(placeAliasesTable)
          .where(sql`${placeAliasesTable.kind} <> 'geonames'`),
      ),
    ]);
    const aliasesByPlace = new Map<string, string[]>();
    for (const alias of aliases)
      aliasesByPlace.set(alias.placeId, [
        ...(aliasesByPlace.get(alias.placeId) ?? []),
        alias.value,
      ]);
    const matcher = createPlaceMatcher(
      rows.map((row) => ({ ...row, aliases: aliasesByPlace.get(row.id) ?? [] })),
    );
    placeMatcherCache = { loadedAt: now, matcher };
    return matcher;
  });

  function requireAdmin(context: AuthContext): DiscoveryEffect<void> {
    if (!context.userId || !context.user) return Effect.fail(new ORPCError("UNAUTHORIZED"));
    if (context.user.role !== "admin") return Effect.fail(new ORPCError("FORBIDDEN"));
    return Effect.void;
  }

  const nodeAccess = Effect.fn("DiscoveryService.nodeAccess")(function* (
    nodeId: string,
    context: AuthContext,
    area?: FeatureArea,
    { platformAdminEdits = true }: { platformAdminEdits?: boolean } = {},
  ) {
    if (!context.userId || !context.user) {
      return yield* Effect.fail(new ORPCError("UNAUTHORIZED"));
    }
    const [record] = yield* query(() =>
      db
        .select({ node: nodes, tenant: tenants })
        .from(nodes)
        .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
        .where(eq(nodes.id, nodeId)),
    );
    if (!record) {
      return yield* Effect.fail(new ORPCError("NOT_FOUND"));
    }
    if (platformAdminEdits && context.user.role === "admin") {
      return { record, level: "editor" as const, manager: true };
    }
    const org = context.organization;
    const role = org?.member?.role ?? "";
    if (!record.tenant.orgId || org?.activeOrganizationId !== record.tenant.orgId || !role) {
      return { record, level: null, manager: false };
    }
    const manager = ["owner", "admin"].includes(role);
    const granted =
      manager ||
      (!!area && resolveTeamAccess(context).teams.some((team) => team.areas.includes(area)));
    return { record, level: granted ? ("editor" as const) : ("member" as const), manager };
  });

  const reportAccess = Effect.fn("DiscoveryService.reportAccess")(function* (
    nodeId: string,
    context: AuthContext,
  ) {
    const { level, record } = yield* nodeAccess(nodeId, context, EVENTS_AREA, {
      platformAdminEdits: false,
    });
    const canEdit = level === "editor";
    if (!canEdit && context.user?.role !== "admin") {
      return yield* Effect.fail(new ORPCError("FORBIDDEN"));
    }
    return { canEdit, organizationId: record.tenant.orgId, tenantId: record.tenant.id };
  });

  const monthlyReportAccess = Effect.fn("DiscoveryService.monthlyReportAccess")(function* (
    nodeId: string,
    context: AuthContext,
  ) {
    const access = yield* reportAccess(nodeId, context);
    const [row] = yield* query(() =>
      db
        .select({
          startedAt: sql<string | null>`min(coalesce(${nodes.activatedAt}, ${nodes.createdAt}))`,
          active: sql<boolean>`coalesce(bool_and(${tenants.status} = 'active' and ${tenants.deletedAt} is null), false)`,
        })
        .from(nodes)
        .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
        .where(and(eq(nodes.tenantId, access.tenantId), listedNode)),
    );
    if (!row?.startedAt) return yield* Effect.fail(new ORPCError("NOT_FOUND"));
    return {
      ...access,
      canEdit: access.canEdit && row.active,
      firstMonth: firstReportMonth(new Date(row.startedAt)),
    };
  });

  const monthlyReportTarget = Effect.fn("DiscoveryService.monthlyReportTarget")(function* (
    input: { nodeId: string; month: string },
    context: AuthContext,
  ) {
    const { firstMonth, ...access } = yield* monthlyReportAccess(input.nodeId, context);
    const now = yield* Clock.currentTimeMillis;
    const window = reportMonthWindow(input.month);
    if (!isReportableMonth(input.month) || input.month < firstMonth) {
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: `This community's monthly reports start with ${firstMonth}`,
        }),
      );
    }
    if (window.from.getTime() > now) {
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", { message: "This month hasn't started yet" }),
      );
    }
    return { ...access, window, now, open: now < window.closesAt.getTime() };
  });

  const monthlyStats = Effect.fn("DiscoveryService.monthlyStats")(function* (
    target: { tenantId: string; month: string; organizationId: string | null },
    window: ReportMonthWindow,
    now: number,
    externalStats: MonthlyExternalStats,
  ) {
    if (!target.organizationId) return yield* Effect.fail(new ORPCError("FORBIDDEN"));
    const data = discoveryActivities.data;
    const startsAt = sql`(${data}->>'startsAt')::timestamptz`;
    const endsAt = sql`coalesce((${data}->>'endsAt')::timestamptz, ${startsAt})`;
    const nowIso = new Date(now).toISOString();
    const [held, external] = yield* Effect.all([
      query(() =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(discoveryActivities)
          .innerJoin(nodes, eq(nodes.id, discoveryActivities.ownerNodeId))
          .where(
            and(
              eq(nodes.tenantId, target.tenantId),
              shownActivity(nowIso),
              sql`${data}->>'kind' = 'event'`,
              sql`${startsAt} >= ${window.from.toISOString()}::timestamptz`,
              sql`${startsAt} < ${window.to.toISOString()}::timestamptz`,
              sql`${endsAt} <= ${nowIso}::timestamptz`,
            ),
          ),
      ),
      externalStats({
        organizationId: target.organizationId,
        month: target.month,
        window,
      }),
    ]);
    return { eventsHeld: held[0]?.count ?? 0, ...external };
  });

  const authorize = Effect.fn("DiscoveryService.authorize")(function* (
    nodeId: string,
    context: AuthContext,
    area?: FeatureArea,
  ) {
    const { record, level } = yield* nodeAccess(nodeId, context, area);
    if (level !== "editor") {
      return yield* Effect.fail(new ORPCError("FORBIDDEN"));
    }
    return record;
  });

  const requireCurator = Effect.fn("DiscoveryService.requireCurator")(function* (
    context: AuthContext,
  ): Effect.fn.Return<void, ORPCError<string, unknown>> {
    if (!context.userId || !context.user) {
      return yield* Effect.fail(new ORPCError("UNAUTHORIZED"));
    }
    if (context.user.role === "admin") return;
    const userId = context.userId;
    const [grant] = yield* query(() =>
      db.select().from(discoveryCurators).where(eq(discoveryCurators.userId, userId)),
    );
    if (!grant) {
      return yield* Effect.fail(new ORPCError("FORBIDDEN"));
    }
  });

  const eligibleProfiles = Effect.fn("DiscoveryService.eligibleProfiles")(function* (
    ids?: string[],
  ) {
    if (ids?.length === 0) return [];
    return yield* query(() =>
      db
        .select({ profile: discoveryProfiles.data, node: nodes, placeSlug: placesTable.slug })
        .from(discoveryProfiles)
        .innerJoin(nodes, eq(discoveryProfiles.nodeId, nodes.id))
        .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
        .leftJoin(placesTable, eq(placesTable.id, nodes.placeId))
        .where(
          and(
            eq(tenants.status, "active"),
            listedNode,
            sql`${discoveryProfiles.data}->>'published' = 'true'`,
            ids ? inArray(nodes.id, ids) : undefined,
          ),
        ),
    );
  });

  const eligibleProfile = Effect.fn("DiscoveryService.eligibleProfile")(function* (
    nodeId: string | null,
  ) {
    if (!nodeId) return null;
    const rows = yield* eligibleProfiles([nodeId]);
    return rows[0]?.profile ?? null;
  });

  const activityById = Effect.fn("DiscoveryService.activityById")(function* (id: string) {
    const [row] = yield* query(() =>
      db.select().from(discoveryActivities).where(eq(discoveryActivities.id, id)),
    );
    return row?.data ?? null;
  });

  const reportingNodes = Effect.fn("DiscoveryService.reportingNodes")(function* (
    events: readonly { data: PublicActivity; reportNodeId: string | null }[],
  ) {
    const tree = yield* placeTree();
    const candidates = events.map((event) =>
      event.data.ownerNodeId
        ? [event.data.ownerNodeId]
        : event.reportNodeId
          ? [event.reportNodeId]
          : tree.rollupNodeIds(event.data),
    );
    const ids = [
      ...new Set(
        events.flatMap((event, index) =>
          event.data.ownerNodeId || event.reportNodeId ? [] : candidates[index]!,
        ),
      ),
    ];
    const active = ids.length
      ? yield* query(() =>
          db
            .select({ id: nodes.id, metadata: nodes.metadata })
            .from(nodes)
            .innerJoin(tenants, eq(tenants.id, nodes.tenantId))
            .where(
              and(inArray(nodes.id, ids), eq(tenants.status, "active"), isNull(tenants.deletedAt)),
            ),
        )
      : [];
    const reporting = new Set(
      active.filter((row) => nodeKindOf(row.metadata) !== PLATFORM_NODE_KIND).map((row) => row.id),
    );
    return new Map(
      events.flatMap((event, index) => {
        const nodeId = event.data.ownerNodeId ?? event.reportNodeId;
        const found = nodeId ?? candidates[index]!.find((id) => reporting.has(id));
        return found ? [[event.data.id, found] as const] : [];
      }),
    );
  });

  const reportingNodeId = Effect.fn("DiscoveryService.reportingNodeId")(function* (
    activity: PublicActivity,
  ) {
    if (activity.ownerNodeId) return activity.ownerNodeId;
    if (activity.kind !== "event") return null;
    const [report] = yield* query(() =>
      db
        .select({ nodeId: eventReports.nodeId })
        .from(eventReports)
        .where(eq(eventReports.activityId, activity.id)),
    );
    if (!report && !activity.placeId) return null;
    const found = yield* reportingNodes([{ data: activity, reportNodeId: report?.nodeId ?? null }]);
    return found.get(activity.id) ?? null;
  });

  const reportedPlaceEvents = Effect.fn("DiscoveryService.reportedPlaceEvents")(function* (
    nodeId: string,
    owned: readonly NodeActivity[],
  ) {
    const tree = yield* placeTree();
    const placeId = tree.placeOfNode.get(nodeId);
    const placeIds = placeId ? tree.descendants(placeId) : [];
    const now = new Date(yield* Clock.currentTimeMillis).toISOString();
    const data = discoveryActivities.data;
    const rows = yield* query(() =>
      db
        .select({ data, reportNodeId: eventReports.nodeId })
        .from(discoveryActivities)
        .leftJoin(eventReports, eq(eventReports.activityId, discoveryActivities.id))
        .where(
          and(
            isNull(discoveryActivities.ownerNodeId),
            sql`${data}->>'kind' = 'event'`,
            sql`(${data}->>'publishedAt')::timestamptz <= ${now}`,
            or(
              eq(eventReports.nodeId, nodeId),
              placeIds.length
                ? and(
                    inArray(discoveryActivities.placeId, placeIds),
                    sql`${data}->>'status' <> 'draft'`,
                  )
                : undefined,
            ),
          ),
        ),
    );
    const reporting = yield* reportingNodes(rows);
    const ownedUrls = new Set(owned.map((activity) => activity.url));
    return rows
      .filter((row) => reporting.get(row.data.id) === nodeId && !ownedUrls.has(row.data.url))
      .map((row): NodeActivity => ({ ...row.data, ownerNodeId: null, nodeIds: [nodeId] }));
  });

  const publicActivity = Effect.fn("DiscoveryService.publicActivity")(function* (id: string) {
    const activity = yield* activityById(id);
    if (
      !activity ||
      activity.status === "draft" ||
      Date.parse(activity.publishedAt) > (yield* Clock.currentTimeMillis) ||
      (activity.ownerNodeId ? !(yield* eligibleProfile(activity.ownerNodeId)) : !activity.placeId)
    ) {
      return null;
    }
    const tree = yield* placeTree();
    const candidates = [...new Set([...activity.nodeIds, ...tree.rollupNodeIds(activity)])];
    const eligible = new Set((yield* eligibleProfiles(candidates)).map((r) => r.node.id));
    return { ...activity, nodeIds: candidates.filter((id) => eligible.has(id)) };
  });

  const list = Effect.fn("DiscoveryService.list")(function* (input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
    nodeId?: string;
  }) {
    const rows = yield* eligibleProfiles(input.nodeId ? [input.nodeId] : undefined);
    const tree = yield* placeTree();
    const nodePlaceId = input.nodeId ? tree.placeOfNode.get(input.nodeId) : undefined;
    const subtreePlaceIds = nodePlaceId ? tree.descendants(nodePlaceId) : [];
    const inSubtree = new Set(subtreePlaceIds);
    const subtreeNodeIds = [...tree.placeOfNode]
      .filter(([, placeId]) => inSubtree.has(placeId))
      .map(([nodeId]) => nodeId);
    const activityRows = yield* query(() =>
      db
        .select({ data: discoveryActivities.data })
        .from(discoveryActivities)
        .leftJoin(discoveryProfiles, eq(discoveryActivities.ownerNodeId, discoveryProfiles.nodeId))
        .leftJoin(nodes, eq(nodes.id, discoveryProfiles.nodeId))
        .leftJoin(tenants, eq(nodes.tenantId, tenants.id))
        .where(
          and(
            or(
              and(
                eq(tenants.status, "active"),
                sql`${discoveryProfiles.data}->>'published' = 'true'`,
              ),
              and(isNull(discoveryActivities.ownerNodeId), isNotNull(discoveryActivities.placeId)),
            ),
            sql`${discoveryActivities.data}->>'status' = 'published'`,
            sql`(${discoveryActivities.data}->>'publishedAt')::timestamptz <= ${new Date(Date.now()).toISOString()}`,
            input.nodeId
              ? or(
                  sql`${discoveryActivities.data}->'nodeIds' ? ${input.nodeId}`,
                  subtreeNodeIds.length
                    ? inArray(discoveryActivities.ownerNodeId, subtreeNodeIds)
                    : undefined,
                  subtreePlaceIds.length
                    ? inArray(discoveryActivities.placeId, subtreePlaceIds)
                    : undefined,
                )
              : undefined,
          ),
        ),
    );
    const activities = activityRows.map((r) => ({
      ...r.data,
      nodeIds: [...new Set([...r.data.nodeIds, ...tree.rollupNodeIds(r.data)])],
    }));
    const eligible = new Set(
      (input.nodeId
        ? yield* eligibleProfiles([...new Set(activities.flatMap((a) => a.nodeIds))])
        : rows
      ).map((r) => r.node.id),
    );
    const byNode = new Map<string, PublicActivity[]>();
    for (const activity of [...activities].sort(
      (a, b) => Number(!a.ownerNodeId) - Number(!b.ownerNodeId),
    ))
      for (const id of activity.nodeIds) {
        const group = byNode.get(id) ?? [];
        if (group.some((other) => other.url === activity.url)) continue;
        group.push(activity);
        byNode.set(id, group);
      }
    const now = yield* Clock.currentTimeMillis;
    const features = yield* query(() =>
      db
        .select()
        .from(discoveryFeatures)
        .where(
          and(
            gte(discoveryFeatures.expiresAt, DateTime.toDateUtc(DateTime.makeUnsafe(now))),
            input.nodeId ? eq(discoveryFeatures.nodeId, input.nodeId) : undefined,
          ),
        ),
    );
    const featureLabels = new Map(features.map((f) => [f.nodeId, f.label]));
    const day = 86_400_000;
    return rows
      .filter(
        ({ profile, node }) =>
          profile.published &&
          (!input.query ||
            `${node.name} ${profile.location}`.toLowerCase().includes(input.query.toLowerCase())) &&
          (!input.region || profile.region === input.region),
      )
      .map(({ profile, node, placeSlug }) => {
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
          activityReason: upcoming ? "Upcoming event" : recent ? "Recently active" : "Quiet lately",
          events: events
            .slice(0, 3)
            .map((a) => ({ ...a, nodeIds: a.nodeIds.filter((id) => eligible.has(id)) })),
          updates: updates.slice(0, 3),
          name: node.name,
          slug: node.slug,
          parentId: node.parentId,
          placeId: node.placeId,
          placeSlug: placeSlug ?? null,
          joinable: hasJoinCode(node.metadata),
          kind: nodeKindOf(node.metadata),
        };
      })
      .filter((p) => (!input.active || p.active) && (!input.upcoming || p.upcoming))
      .sort((a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId));
  });

  const directory = Effect.fn("DiscoveryService.directory")(function* (input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
  }) {
    const listed = yield* list(input);
    if (input.region || input.active || input.upcoming) return listed;
    const rows = yield* query(() =>
      db
        .select({ node: nodes, placeSlug: placesTable.slug })
        .from(nodes)
        .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
        .leftJoin(placesTable, eq(placesTable.id, nodes.placeId))
        .leftJoin(discoveryProfiles, eq(discoveryProfiles.nodeId, nodes.id))
        .where(and(eq(tenants.status, "active"), listedNode, isNull(discoveryProfiles.nodeId))),
    );
    const search = input.query?.toLowerCase();
    const basic = rows
      .filter(({ node }) => !search || node.name.toLowerCase().includes(search))
      .map(({ node, placeSlug }) => ({
        nodeId: node.id,
        summary: "",
        location: "",
        region: "",
        latitude: null,
        longitude: null,
        channels: [],
        published: false,
        featured: null,
        active: false,
        upcoming: false,
        activityReason: "Quiet lately",
        events: [],
        updates: [],
        name: node.name,
        slug: node.slug,
        parentId: node.parentId,
        placeId: node.placeId,
        placeSlug: placeSlug ?? null,
        joinable: hasJoinCode(node.metadata),
        kind: nodeKindOf(node.metadata),
      }));
    return [...listed, ...basic].sort(
      (a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId),
    );
  });

  const saveActivity = Effect.fn("DiscoveryService.saveActivity")(function* (
    input: Omit<DiscoveryActivity, "id" | "luma" | "placeId"> & { id?: string },
    context: AuthContext,
  ) {
    const initial = input.id ? yield* activityById(input.id) : null;
    if (input.id && !initial) {
      return yield* Effect.fail(new ORPCError("NOT_FOUND"));
    }
    if (initial && !initial.ownerNodeId) {
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: "Edit this event in Luma. Changes appear here automatically.",
        }),
      );
    }
    const area = input.kind === "event" ? EVENTS_AREA : undefined;
    yield* authorize(initial?.ownerNodeId ?? input.ownerNodeId, context, area);
    for (const nodeId of new Set(input.nodeIds)) {
      if (!initial?.nodeIds.includes(nodeId)) yield* authorize(nodeId, context, area);
    }
    return yield* query(() =>
      db.transaction(async (tx) => {
        await tx
          .select()
          .from(nodes)
          .where(eq(nodes.id, initial?.ownerNodeId ?? input.ownerNodeId))
          .for("update");
        const [row] = input.id
          ? await tx
              .select()
              .from(discoveryActivities)
              .where(eq(discoveryActivities.id, input.id))
              .for("update")
          : [];
        const previous = row?.data;
        if (input.id && !previous) throw new ORPCError("NOT_FOUND");
        if (
          previous &&
          (previous.ownerNodeId !== input.ownerNodeId || previous.kind !== input.kind)
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "Activity ownership and kind cannot change",
          });
        if (previous?.luma) {
          const fields = [
            "title",
            "summary",
            "url",
            "source",
            "publishedAt",
            "startsAt",
            "endsAt",
            "timezone",
            "venue",
          ] as const;
          if (
            fields.some((field) => input[field] !== previous[field]) ||
            input.status !== previous.status
          )
            throw new ORPCError("BAD_REQUEST", {
              message: "Edit this event in Luma. Changes appear here automatically.",
            });
        }
        const data: DiscoveryActivity = {
          ...input,
          luma: previous?.luma,
          id: input.id ?? crypto.randomUUID(),
          nodeIds: [...new Set(input.nodeIds)],
          url: canonicalActivityUrl(input.url),
        };
        const [duplicate] = await tx
          .select()
          .from(discoveryActivities)
          .where(
            and(
              eq(discoveryActivities.canonicalUrl, data.url),
              isNotNull(discoveryActivities.ownerNodeId),
              ne(discoveryActivities.id, data.id),
            ),
          )
          .limit(1);
        if (duplicate)
          throw new ORPCError("BAD_REQUEST", {
            message: `"${duplicate.data.title}" already uses this link. Give each event its own page link, like its Luma or Meetup page.`,
          });
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
        return data;
      }),
    );
  });

  function calendarActivity(
    event: LumaEvent,
    input: { nodeId: string; calendarId: string; calendarName: string },
    previous: PublicActivity | undefined,
    cancel: boolean,
  ): DiscoveryActivity {
    return {
      id: previous?.id ?? crypto.randomUUID(),
      ownerNodeId: input.nodeId,
      nodeIds: previous?.nodeIds ?? [input.nodeId],
      kind: "event",
      title: event.name.slice(0, 160),
      summary: "Event details and registration are managed on Luma.",
      url: canonicalActivityUrl(event.url),
      source: `Luma · ${input.calendarName}`.slice(0, 120),
      publishedAt: new Date(event.created_at).toISOString(),
      startsAt: new Date(event.start_at).toISOString(),
      endsAt: new Date(event.end_at).toISOString(),
      timezone: event.timezone,
      venue: lumaVenue(event),
      status: lumaStatus(previous, cancel),
      luma: { calendarId: input.calendarId, eventId: event.id },
    };
  }

  async function saveCalendarActivity(
    tx: Tx,
    data: DiscoveryActivity,
    previous: typeof discoveryActivities.$inferSelect | undefined,
  ): Promise<"imported" | "updated" | "skipped"> {
    const [duplicate] = await tx
      .select({ id: discoveryActivities.id })
      .from(discoveryActivities)
      .where(
        and(
          eq(discoveryActivities.canonicalUrl, data.url),
          eq(discoveryActivities.ownerNodeId, data.ownerNodeId),
          ne(discoveryActivities.id, data.id),
        ),
      );
    if (duplicate) return "skipped";
    if (previous) {
      await tx
        .update(discoveryActivities)
        .set({ data, canonicalUrl: data.url })
        .where(eq(discoveryActivities.id, previous.id));
      return "updated";
    }
    const saved = await tx
      .insert(discoveryActivities)
      .values({ id: data.id, ownerNodeId: data.ownerNodeId, canonicalUrl: data.url, data })
      .onConflictDoNothing()
      .returning({ id: discoveryActivities.id });
    return saved.length ? "imported" : "skipped";
  }

  function connectCalendar(input: { nodeId: string; calendarId: string }, actorId: string) {
    return query(async () => {
      const snapshot = await luma.snapshot(input.calendarId);
      return db.transaction(async (tx) => {
        await tx.select().from(nodes).where(eq(nodes.id, input.nodeId)).for("update");
        const existing = await tx
          .select()
          .from(discoveryActivities)
          .where(eq(discoveryActivities.ownerNodeId, input.nodeId))
          .for("update");
        const importedById = new Map(
          existing.filter((row) => row.data.luma).map((row) => [row.data.luma!.eventId, row]),
        );
        const seen = new Set<string>();
        const result = { imported: 0, updated: 0, withdrawn: 0, skipped: 0 };
        const target = { ...input, calendarName: snapshot.calendar.name };
        for (const event of snapshot.events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          const previous = importedById.get(event.id);
          const data = calendarActivity(event, target, previous?.data, false);
          result[await saveCalendarActivity(tx, data, previous)]++;
        }
        const gone = existing.filter((row) => row.data.luma && !seen.has(row.data.luma.eventId));
        await withdrawLumaRows(tx, gone);
        result.withdrawn = gone.length;
        await tx
          .insert(discoveryLumaConnections)
          .values({ ...input, calendarName: snapshot.calendar.name })
          .onConflictDoUpdate({
            target: discoveryLumaConnections.nodeId,
            set: { calendarId: input.calendarId, calendarName: snapshot.calendar.name },
          });
        await tx.insert(discoveryHistory).values({
          nodeId: input.nodeId,
          targetId: input.calendarId,
          actorId,
          action: `Luma connected: ${result.imported} imported, ${result.updated} updated, ${result.withdrawn} withdrawn`,
        });
        return result;
      });
    });
  }

  const upsertCalendarEvent = Effect.fn("DiscoveryService.upsertCalendarEvent")(function* (
    calendarId: string,
    eventId: string,
    event: LumaEvent | null,
    cancel: boolean,
  ) {
    return yield* query(() =>
      db.transaction(async (tx) => {
        const connections = await tx
          .select()
          .from(discoveryLumaConnections)
          .where(eq(discoveryLumaConnections.calendarId, calendarId))
          .orderBy(discoveryLumaConnections.nodeId);
        for (const connection of connections) {
          await tx.select().from(nodes).where(eq(nodes.id, connection.nodeId)).for("update");
          const [previous] = await tx
            .select()
            .from(discoveryActivities)
            .where(
              and(
                eq(discoveryActivities.ownerNodeId, connection.nodeId),
                sql`${discoveryActivities.data}->'luma'->>'calendarId' = ${calendarId}`,
                sql`${discoveryActivities.data}->'luma'->>'eventId' = ${eventId}`,
              ),
            )
            .for("update");
          if (!event) {
            if (previous) await withdrawLumaRows(tx, [previous]);
            continue;
          }
          const data = calendarActivity(event, connection, previous?.data, cancel);
          await saveCalendarActivity(tx, data, previous);
        }
      }),
    );
  });

  const upsertPlaceEvent = Effect.fn("DiscoveryService.upsertPlaceEvent")(function* (
    event: LumaEvent,
    calendarId: string,
    cancel = false,
  ) {
    const matcher = yield* placeMatcher();
    const id = lumaPlaceActivityId(event.id);
    const match = matcher.match({
      coordinate: event.coordinate ?? null,
      city: event.geo_address_json?.city,
      region: event.geo_address_json?.region,
      country: event.geo_address_json?.country,
    });
    const matchedPlaceId = match?.placeId ?? null;
    const venueKey = lumaVenueKey(event);
    return yield* query(() =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(discoveryActivities)
          .where(eq(discoveryActivities.id, id))
          .for("update");
        const pinned =
          row?.data.luma?.placeMatch === "manual" &&
          (row.data.luma.venueKey ?? venueKey) === venueKey
            ? row.placeId
            : null;
        const placeId = pinned ?? matchedPlaceId;
        const data: PublicActivity = {
          id,
          ownerNodeId: null,
          placeId,
          nodeIds: [],
          kind: "event",
          title: event.name.slice(0, 160),
          summary: "Event details and registration are managed on Luma.",
          url: canonicalActivityUrl(event.url),
          source: "Luma",
          publishedAt: new Date(event.created_at).toISOString(),
          startsAt: new Date(event.start_at).toISOString(),
          endsAt: new Date(event.end_at).toISOString(),
          timezone: event.timezone,
          venue: lumaVenue(event),
          status: lumaStatus(row?.data, cancel),
          luma: {
            calendarId,
            eventId: event.id,
            placeMatch: pinned ? "manual" : (match?.by ?? "none"),
            venueKey,
          },
        };
        await tx
          .insert(discoveryActivities)
          .values({ id, ownerNodeId: null, placeId, canonicalUrl: data.url, data })
          .onConflictDoUpdate({
            target: discoveryActivities.id,
            set: { placeId, canonicalUrl: data.url, data },
          });
        return { created: !row, placeId };
      }),
    );
  });

  function removePlaceEvent(eventId: string) {
    return query(() =>
      db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(discoveryActivities)
          .where(
            and(
              eq(discoveryActivities.id, lumaPlaceActivityId(eventId)),
              isNull(discoveryActivities.ownerNodeId),
            ),
          )
          .for("update");
        await withdrawLumaRows(tx, rows);
      }),
    );
  }

  const receiveLumaWebhook = Effect.fn("DiscoveryService.receiveLumaWebhook")(function* (input: {
    signature: string | null;
    rawBody: string;
    calendarId?: string;
  }) {
    const calendarId = input.calendarId ?? lumaMainCalendarId;
    if (!calendarId || lumaWebhookSecrets.length === 0)
      return yield* Effect.fail(new ORPCError("NOT_FOUND"));
    const verified = verifyLumaWebhook({
      secrets: lumaWebhookSecrets,
      signatureHeader: input.signature,
      rawBody: input.rawBody,
      nowSeconds: Math.floor((yield* Clock.currentTimeMillis) / 1000),
    });
    if (!verified) return yield* Effect.fail(new ORPCError("UNAUTHORIZED"));
    const body = yield* Effect.try({
      try: () => JSON.parse(input.rawBody) as unknown,
      catch: () => new ORPCError("BAD_REQUEST", { message: "Invalid webhook body" }),
    });
    const webhook = lumaWebhookSchema.safeParse(body);
    if (!webhook.success) return { result: "ignored" as const };
    const { type, data } = webhook.data;
    if (type === "calendar.event.added" && data.platform !== "luma")
      return { result: "ignored" as const };
    const cancel = type === "event.canceled";
    if (calendarId !== lumaMainCalendarId) {
      const [connection] = yield* query(() =>
        db
          .select({ nodeId: discoveryLumaConnections.nodeId })
          .from(discoveryLumaConnections)
          .where(eq(discoveryLumaConnections.calendarId, calendarId))
          .limit(1),
      );
      if (!connection) return { result: "ignored" as const };
      const event = yield* query(() => luma.event(calendarId, data.id));
      if (event && Date.parse(event.end_at) < Date.parse(event.start_at)) {
        yield* Effect.logWarning(`[Discovery] Ignored invalid Luma webhook event ${data.id}`);
        return { result: "ignored" as const };
      }
      yield* upsertCalendarEvent(calendarId, data.id, event, cancel);
      return { result: !event || cancel ? ("removed" as const) : ("associated" as const) };
    }
    const event = yield* query(() => luma.event(calendarId, data.id));
    if (!event) {
      yield* removePlaceEvent(data.id);
      return { result: "removed" as const };
    }
    if (Date.parse(event.end_at) < Date.parse(event.start_at)) {
      yield* Effect.logWarning(`[Discovery] Ignored invalid Luma webhook event ${data.id}`);
      return { result: "ignored" as const };
    }
    const saved = yield* upsertPlaceEvent(event, calendarId, cancel);
    if (cancel) return { result: "removed" as const };
    return { result: saved.placeId ? ("associated" as const) : ("unmatched" as const) };
  });

  const backfillLumaPlaceEvents = Effect.fn("DiscoveryService.backfillLumaPlaceEvents")(function* (
    context: AuthContext,
  ) {
    yield* requireAdmin(context);
    if (!lumaMainCalendarId)
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", { message: "No main Luma calendar is configured." }),
      );
    const listed = yield* query(() => luma.allEvents(lumaMainCalendarId));
    const result = { imported: 0, updated: 0, unmatched: 0, skipped: listed.skipped };
    for (const event of listed.events) {
      const saved = yield* upsertPlaceEvent(event, lumaMainCalendarId);
      if (saved.created) result.imported++;
      else result.updated++;
      if (!saved.placeId) result.unmatched++;
    }
    return result;
  });

  return {
    directory,
    lumaCalendars: Effect.fn("DiscoveryService.lumaCalendars")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      yield* authorize(nodeId, context, EVENTS_AREA);
      const [connection] = yield* query(() =>
        db
          .select()
          .from(discoveryLumaConnections)
          .where(eq(discoveryLumaConnections.nodeId, nodeId)),
      );
      const listed = yield* query(() => luma.list());
      return {
        ...listed,
        calendars: listed.calendars.filter((calendar) => calendar.id !== lumaMainCalendarId),
        connection: connection
          ? {
              calendarId: connection.calendarId,
              calendarName: connection.calendarName,
              webhookPath: `/api/webhooks/luma/${encodeURIComponent(connection.calendarId)}`,
            }
          : null,
      };
    }),
    receiveLumaWebhook,
    backfillLumaPlaceEvents,
    lumaTriage: Effect.fn("DiscoveryService.lumaTriage")(function* (context: AuthContext) {
      yield* requireAdmin(context);
      const data = discoveryActivities.data;
      const rows = yield* query(() =>
        db
          .select({ data })
          .from(discoveryActivities)
          .where(
            and(
              isNull(discoveryActivities.ownerNodeId),
              isNull(discoveryActivities.placeId),
              sql`${data} ? 'luma'`,
              sql`${data}->>'status' = 'published'`,
            ),
          )
          .orderBy(desc(sql`(${data}->>'startsAt')::timestamptz`)),
      );
      return {
        events: rows.map(({ data: event }) => ({
          id: event.id,
          title: event.title,
          url: event.url,
          venue: event.venue,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
        })),
      };
    }),
    associateLumaEvent: Effect.fn("DiscoveryService.associateLumaEvent")(function* (
      input: { activityId: string; placeId: string },
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      return yield* query(() =>
        db.transaction(async (tx) => {
          const [place] = await tx
            .select({ id: placesTable.id })
            .from(placesTable)
            .where(eq(placesTable.id, input.placeId));
          if (!place) throw new ORPCError("NOT_FOUND", { message: "Place not found" });
          const [row] = await tx
            .select()
            .from(discoveryActivities)
            .where(
              and(
                eq(discoveryActivities.id, input.activityId),
                isNull(discoveryActivities.ownerNodeId),
                sql`${discoveryActivities.data} ? 'luma'`,
              ),
            )
            .for("update");
          if (!row?.data.luma) throw new ORPCError("NOT_FOUND");
          if (row.data.status === "cancelled")
            throw new ORPCError("BAD_REQUEST", { message: "This event was cancelled on Luma." });
          const data: PublicActivity = {
            ...row.data,
            placeId: place.id,
            luma: { ...row.data.luma, placeMatch: "manual" },
          };
          await tx
            .update(discoveryActivities)
            .set({ placeId: place.id, data })
            .where(eq(discoveryActivities.id, row.id));
          return data;
        }),
      );
    }),
    importLuma: Effect.fn("DiscoveryService.importLuma")(function* (
      input: { nodeId: string; calendarId: string },
      context: AuthContext,
    ) {
      yield* authorize(input.nodeId, context, EVENTS_AREA);
      if (lumaMainCalendarId && input.calendarId === lumaMainCalendarId)
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "The main calendar is shared by every community and can't be connected.",
          }),
        );
      return yield* connectCalendar(input, context.userId!);
    }),
    disconnectLuma: Effect.fn("DiscoveryService.disconnectLuma")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      yield* authorize(nodeId, context);
      yield* query(() =>
        db.transaction(async (tx) => {
          await tx.select().from(nodes).where(eq(nodes.id, nodeId)).for("update");
          await tx
            .delete(discoveryLumaConnections)
            .where(eq(discoveryLumaConnections.nodeId, nodeId));
          const rows = await tx
            .select()
            .from(discoveryActivities)
            .where(
              and(
                eq(discoveryActivities.ownerNodeId, nodeId),
                sql`${discoveryActivities.data} ? 'luma'`,
              ),
            )
            .for("update");
          await withdrawLumaRows(tx, rows);
          await tx.insert(discoveryHistory).values({
            nodeId,
            targetId: nodeId,
            actorId: context.userId!,
            action: "Luma calendar disconnected",
          });
        }),
      );
      return { disconnected: true };
    }),
    track: Effect.fn("DiscoveryService.track")(function* (
      input: DiscoveryMeasurement,
      context: AuthContext,
    ) {
      if (
        !input.consent ||
        context.user?.role === "admin" ||
        ["owner", "admin"].includes(context.organization?.member?.role ?? "")
      )
        return { accepted: false };
      if (context.userId) {
        const userId = context.userId;
        const curators = yield* query(() =>
          db.select().from(discoveryCurators).where(eq(discoveryCurators.userId, userId)),
        );
        if (curators.length) return { accepted: false };
      }
      const now = yield* Clock.currentTimeMillis;
      yield* query(() =>
        db
          .delete(discoveryMeasurements)
          .where(
            lt(
              discoveryMeasurements.createdAt,
              DateTime.toDateUtc(DateTime.makeUnsafe(now - 28 * 86400000)),
            ),
          ),
      );
      if (input.kind !== "visit") {
        const [visit] = yield* query(() =>
          db
            .select()
            .from(discoveryMeasurements)
            .where(eq(discoveryMeasurements.key, `${input.visitId}:visit`)),
        );
        if (
          !visit ||
          visit.createdAt.getTime() < now - 30 * 60000 ||
          visit.campaign !== input.campaign
        )
          return { accepted: false };
        const node = yield* eligibleProfile(input.nodeId);
        if (!node) return { accepted: false };
        if (input.kind === "channel" && !node.channels.some((c) => c.url === input.target))
          return { accepted: false };
        if (input.kind === "event") {
          const activity = yield* publicActivity(input.target);
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
      yield* query(() =>
        db
          .insert(discoveryMeasurements)
          .values({
            key,
            visitId: input.visitId,
            nodeId: input.kind === "visit" ? null : input.nodeId,
            campaign: input.campaign,
            kind: input.kind,
          })
          .onConflictDoNothing(),
      );
      return { accepted: true };
    }),
    metrics: Effect.fn("DiscoveryService.metrics")(function* (context: AuthContext) {
      yield* requireCurator(context);
      const since = gte(
        discoveryMeasurements.createdAt,
        DateTime.toDateUtc(DateTime.makeUnsafe((yield* Clock.currentTimeMillis) - 28 * 86400000)),
      );
      const [totals] = yield* query(() =>
        db
          .select({
            visits: sql<number>`count(distinct case when kind = 'visit' then visit_id end)::int`,
            activatedVisits: sql<number>`count(distinct case when kind in ('event', 'channel') then visit_id end)::int`,
          })
          .from(discoveryMeasurements)
          .where(since),
      );
      const rows = yield* query(() =>
        db
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
          ),
      );
      return { visits: totals?.visits ?? 0, activatedVisits: totals?.activatedVisits ?? 0, rows };
    }),
    eventStats: Effect.fn("DiscoveryService.eventStats")(function* (context: AuthContext) {
      yield* requireAdmin(context);
      const now = new Date(yield* Clock.currentTimeMillis).toISOString();
      const data = discoveryActivities.data;
      const isEvent = sql`${data}->>'kind' = 'event'`;
      const endsAt = sql`(${data}->>'endsAt')::timestamptz`;
      const startsAt = sql`(${data}->>'startsAt')::timestamptz`;
      return yield* query(() =>
        db
          .select({
            nodeId: discoveryActivities.ownerNodeId,
            upcoming: sql<number>`count(*) filter (where ${isEvent} and ${endsAt} >= ${now})::int`,
            past: sql<number>`count(*) filter (where ${isEvent} and ${endsAt} < ${now})::int`,
            lastActivityAt: sql<
              string | null
            >`to_char(max(greatest((${data}->>'publishedAt')::timestamptz, case when ${startsAt} <= ${now}::timestamptz then ${startsAt} end)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
          })
          .from(discoveryActivities)
          .where(and(isNotNull(discoveryActivities.ownerNodeId), shownActivity(now)))
          .groupBy(discoveryActivities.ownerNodeId),
      ).pipe(
        Effect.map((rows) =>
          rows.flatMap(({ nodeId, ...row }) => (nodeId ? [{ ...row, nodeId }] : [])),
        ),
      );
    }),
    adminEvents: Effect.fn("DiscoveryService.adminEvents")(function* (context: AuthContext) {
      yield* requireAdmin(context);
      const now = new Date(yield* Clock.currentTimeMillis).toISOString();
      const data = discoveryActivities.data;
      const rows = yield* query(() =>
        db
          .select({
            id: discoveryActivities.id,
            data,
            nodeId: nodes.id,
            nodeName: nodes.name,
            nodeMetadata: nodes.metadata,
            organizationId: tenants.orgId,
            reportSubmittedAt: eventReports.submittedAt,
            reportUpdatedAt: eventReports.updatedAt,
            reportReviewedAt: eventReports.reviewedAt,
            reportSource: eventReports.source,
          })
          .from(discoveryActivities)
          .innerJoin(nodes, eq(nodes.id, discoveryActivities.ownerNodeId))
          .innerJoin(tenants, eq(tenants.id, nodes.tenantId))
          .leftJoin(eventReports, eq(eventReports.activityId, discoveryActivities.id))
          .where(
            and(
              shownActivity(now),
              sql`${data}->>'kind' = 'event'`,
              eq(tenants.status, "active"),
              isNull(tenants.deletedAt),
            ),
          ),
      );
      const placed = yield* query(() =>
        db
          .select({
            id: discoveryActivities.id,
            data,
            reportNodeId: eventReports.nodeId,
            reportSubmittedAt: eventReports.submittedAt,
            reportUpdatedAt: eventReports.updatedAt,
            reportReviewedAt: eventReports.reviewedAt,
            reportSource: eventReports.source,
          })
          .from(discoveryActivities)
          .leftJoin(eventReports, eq(eventReports.activityId, discoveryActivities.id))
          .where(
            and(
              isNull(discoveryActivities.ownerNodeId),
              isNotNull(discoveryActivities.placeId),
              shownActivity(now),
              sql`${data}->>'kind' = 'event'`,
            ),
          ),
      );
      const ownedUrls = new Set(rows.map((row) => row.data.url));
      const placedNodeIds = yield* reportingNodes(
        placed.filter((row) => !ownedUrls.has(row.data.url)),
      );
      const placedNodes = placedNodeIds.size
        ? yield* query(() =>
            db
              .select({
                nodeId: nodes.id,
                nodeName: nodes.name,
                nodeMetadata: nodes.metadata,
                organizationId: tenants.orgId,
              })
              .from(nodes)
              .innerJoin(tenants, eq(tenants.id, nodes.tenantId))
              .where(
                and(
                  inArray(nodes.id, [...new Set(placedNodeIds.values())]),
                  eq(tenants.status, "active"),
                  isNull(tenants.deletedAt),
                ),
              ),
          )
        : [];
      const nodeById = new Map(placedNodes.map((node) => [node.nodeId, node]));
      const all = [
        ...rows,
        ...placed.flatMap(({ reportNodeId: _reportNodeId, ...row }) => {
          const node = nodeById.get(placedNodeIds.get(row.id) ?? "");
          return node ? [{ ...row, ...node }] : [];
        }),
      ].sort(
        (a, b) =>
          (b.data.startsAt ?? "").localeCompare(a.data.startsAt ?? "") || a.id.localeCompare(b.id),
      );
      return all.map((row) => ({
        id: row.id,
        title: row.data.title,
        url: row.data.url,
        startsAt: row.data.startsAt ?? null,
        endsAt: row.data.endsAt ?? null,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        publicPage: nodeKindOf(row.nodeMetadata) !== PLATFORM_NODE_KIND,
        organizationId: row.organizationId ?? null,
        reportSubmittedAt: row.reportSubmittedAt?.toISOString() ?? null,
        reportUpdatedAt: row.reportUpdatedAt?.toISOString() ?? null,
        reportReviewedAt: row.reportReviewedAt?.toISOString() ?? null,
        reportSource: row.reportSource ?? null,
      }));
    }),
    studio: Effect.fn("DiscoveryService.studio")(function* (context: AuthContext) {
      yield* requireCurator(context);
      const isAdmin = context.user?.role === "admin";
      const reports = isAdmin
        ? yield* query(() =>
            db.select().from(discoveryReports).orderBy(desc(discoveryReports.createdAt)).limit(200),
          )
        : [];
      const curators = isAdmin ? yield* query(() => db.select().from(discoveryCurators)) : [];
      return {
        isAdmin,
        nodes: yield* list({}),
        curators: curators.map((r) => r.userId),
        reports: reports.map(({ token: _token, ...r }) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }),
    setCurator: Effect.fn("DiscoveryService.setCurator")(function* (
      input: { userId: string; enabled: boolean },
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      if (input.enabled) {
        yield* query(() =>
          db.insert(discoveryCurators).values({ userId: input.userId }).onConflictDoNothing(),
        );
      } else {
        yield* query(() =>
          db.delete(discoveryCurators).where(eq(discoveryCurators.userId, input.userId)),
        );
      }
      return { success: true };
    }),
    feature: Effect.fn("DiscoveryService.feature")(function* (
      input: { nodeId: string; label: string; expiresAt: string },
      context: AuthContext,
    ) {
      yield* requireCurator(context);
      if (Date.parse(input.expiresAt) > (yield* Clock.currentTimeMillis) + 90 * 86400000) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", { message: "Feature expiry must be within 90 days" }),
        );
      }
      if (!(yield* eligibleProfile(input.nodeId))) {
        return yield* Effect.fail(new ORPCError("NOT_FOUND"));
      }
      const data = {
        ...input,
        expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe(input.expiresAt)),
      };
      yield* query(() =>
        db
          .insert(discoveryFeatures)
          .values(data)
          .onConflictDoUpdate({ target: discoveryFeatures.nodeId, set: data }),
      );
      return { success: true };
    }),
    report: Effect.fn("DiscoveryService.report")(function* (input: {
      targetId: string;
      kind: "profile" | "activity";
      reason: string;
      token: string;
    }) {
      const activity = input.kind === "activity" ? yield* publicActivity(input.targetId) : null;
      const lockId = input.kind === "profile" ? input.targetId : (activity?.ownerNodeId ?? null);
      if (input.kind === "profile" ? !(yield* eligibleProfile(input.targetId)) : !activity) {
        return yield* Effect.fail(new ORPCError("NOT_FOUND"));
      }
      yield* query(() =>
        db.transaction(async (tx) => {
          if (lockId)
            await tx.select({ id: nodes.id }).from(nodes).where(eq(nodes.id, lockId)).for("update");
          else
            await tx
              .select({ id: discoveryActivities.id })
              .from(discoveryActivities)
              .where(eq(discoveryActivities.id, input.targetId))
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
        }),
      );
      return { success: true };
    }),
    moderate: Effect.fn("DiscoveryService.moderate")(function* (
      input: { reportId: string; action: "dismiss" | "unpublish"; note: string },
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      const [report] = yield* query(() =>
        db.select().from(discoveryReports).where(eq(discoveryReports.id, input.reportId)),
      );
      if (!report) {
        return yield* Effect.fail(new ORPCError("NOT_FOUND"));
      }
      yield* query(() =>
        db.transaction(async (tx) => {
          if (input.action === "unpublish") {
            let ownerNodeId: string | null;
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
                .where(eq(discoveryActivities.id, report.targetId))
                .for("update");
              if (!row) throw new ORPCError("NOT_FOUND");
              ownerNodeId = row.ownerNodeId;
              await tx
                .update(discoveryActivities)
                .set({
                  data: {
                    ...row.data,
                    status: "draft",
                    luma: row.data.luma && { ...row.data.luma, removed: false },
                  },
                })
                .where(eq(discoveryActivities.id, report.targetId));
            }
            if (ownerNodeId)
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
        }),
      );
      return { success: true };
    }),
    history: Effect.fn("DiscoveryService.history")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      yield* authorize(nodeId, context);
      const rows = yield* query(() =>
        db
          .select()
          .from(discoveryHistory)
          .where(eq(discoveryHistory.nodeId, nodeId))
          .orderBy(desc(discoveryHistory.recordedAt))
          .limit(100),
      );
      return rows.map(({ nodeId: _nodeId, ...row }) => ({
        ...row,
        recordedAt: row.recordedAt.toISOString(),
      }));
    }),
    saveActivity,
    activities: Effect.fn("DiscoveryService.activities")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      const { level, manager } = yield* nodeAccess(nodeId, context, EVENTS_AREA);
      if (!level) {
        return yield* Effect.fail(new ORPCError("FORBIDDEN"));
      }
      const rows = yield* query(() =>
        db.select().from(discoveryActivities).where(eq(discoveryActivities.ownerNodeId, nodeId)),
      );
      const owned: NodeActivity[] = rows.map((r) => ({ ...r.data, ownerNodeId: nodeId }));
      const activities = [...owned, ...(yield* reportedPlaceEvents(nodeId, owned))];
      if (manager) return activities;
      if (level === "editor") return activities.filter((activity) => activity.kind === "event");
      return activities.filter((activity) => activity.status !== "draft");
    }),
    eventOrganization: Effect.fn("DiscoveryService.eventOrganization")(function* (eventId: string) {
      const [row] = yield* query(() =>
        db
          .select({ event: discoveryActivities.data, organizationId: tenants.orgId })
          .from(discoveryActivities)
          .innerJoin(nodes, eq(discoveryActivities.ownerNodeId, nodes.id))
          .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
          .where(eq(discoveryActivities.id, eventId)),
      );
      return row ?? null;
    }),
    organizationEvents: Effect.fn("DiscoveryService.organizationEvents")(function* (
      organizationIds: string[],
    ) {
      const byOrganization = new Map<
        string,
        {
          communityName: string | null;
          events: Array<{ id: string; title: string; startsAt: string | null }>;
        }
      >(organizationIds.map((id) => [id, { communityName: null, events: [] }]));
      if (organizationIds.length === 0) return byOrganization;
      const rows = yield* query(() =>
        db
          .select({
            organizationId: tenants.orgId,
            communityName: tenants.name,
            event: discoveryActivities.data,
          })
          .from(tenants)
          .leftJoin(nodes, eq(nodes.tenantId, tenants.id))
          .leftJoin(discoveryActivities, eq(discoveryActivities.ownerNodeId, nodes.id))
          .where(inArray(tenants.orgId, organizationIds)),
      );
      for (const row of rows) {
        const entry = row.organizationId ? byOrganization.get(row.organizationId) : undefined;
        if (!entry) continue;
        entry.communityName ??= row.communityName;
        if (row.event?.kind !== "event") continue;
        entry.events.push({
          id: row.event.id,
          title: row.event.title,
          startsAt: row.event.startsAt,
        });
      }
      return byOrganization;
    }),
    activity: Effect.fn("DiscoveryService.activity")(function* (id: string) {
      return yield* publicActivity(id);
    }),
    get: Effect.fn("DiscoveryService.get")(function* (nodeId: string) {
      const results = yield* list({ nodeId });
      return results[0] ?? null;
    }),
    profile: Effect.fn("DiscoveryService.profile")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      yield* authorize(nodeId, context, EVENTS_AREA);
      const [row] = yield* query(() =>
        db.select().from(discoveryProfiles).where(eq(discoveryProfiles.nodeId, nodeId)),
      );
      return row?.data ?? null;
    }),
    saveProfile: Effect.fn("DiscoveryService.saveProfile")(function* (
      input: DiscoveryProfile,
      context: AuthContext,
    ) {
      const record = yield* authorize(input.nodeId, context);
      const kind = nodeKindOf(record.node.metadata);
      const place = profilePlace(input, kind);
      const tagged = input.geocodedLocation?.trim() ?? "";
      const next: StoredDiscoveryProfile = !place
        ? {
            ...input,
            latitude: null,
            longitude: null,
            geocodedLocation: null,
            geocodeHint: null,
          }
        : tagged && place !== tagged
          ? {
              ...input,
              latitude: null,
              longitude: null,
              geocodedLocation: null,
              geocodeHint: null,
            }
          : { ...input, geocodeHint: null };
      yield* Effect.tryPromise(() => adoptCatalogPlace(db, record.node, place, kind)).pipe(
        Effect.ignore,
      );
      yield* query(() =>
        db.transaction(async (tx) => {
          await tx
            .insert(discoveryProfiles)
            .values({ nodeId: next.nodeId, data: next })
            .onConflictDoUpdate({ target: discoveryProfiles.nodeId, set: { data: next } });
          await tx.insert(discoveryHistory).values({
            nodeId: next.nodeId,
            targetId: next.nodeId,
            actorId: context.userId!,
            action: next.published ? "profile published" : "profile saved as draft",
          });
        }),
      );
      return next;
    }),
    eventReport: Effect.fn("DiscoveryService.eventReport")(function* (
      activityId: string,
      context: AuthContext,
    ) {
      const activity = yield* activityById(activityId);
      const nodeId = activity ? yield* reportingNodeId(activity) : null;
      if (!activity || !nodeId || activity.kind !== "event") {
        return yield* Effect.fail(new ORPCError("NOT_FOUND"));
      }
      const { canEdit } = yield* reportAccess(nodeId, context);
      const [row] = yield* query(() =>
        db.select().from(eventReports).where(eq(eventReports.activityId, activityId)),
      );
      return {
        report: row ? storedReport(row) : null,
        canEdit,
        canReview: context.user?.role === "admin",
      };
    }),
    saveEventReport: Effect.fn("DiscoveryService.saveEventReport")(function* (
      input: { activityId: string; report: EventReport },
      context: AuthContext,
    ) {
      const activity = yield* activityById(input.activityId);
      const nodeId = activity ? yield* reportingNodeId(activity) : null;
      if (!activity || !nodeId || activity.kind !== "event") {
        return yield* Effect.fail(new ORPCError("NOT_FOUND"));
      }
      const { canEdit } = yield* reportAccess(nodeId, context);
      if (!canEdit) return yield* Effect.fail(new ORPCError("FORBIDDEN"));
      const now = yield* Clock.currentTimeMillis;
      const end = activity.endsAt ?? activity.startsAt;
      if (
        activity.status === "cancelled" ||
        (!activity.ownerNodeId && activity.status !== "published") ||
        !end ||
        Date.parse(end) > now
      ) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "Reports can only be submitted for events that have ended",
          }),
        );
      }
      const userId = context.userId!;
      const at = new Date(now);
      const [row] = yield* query(() =>
        db
          .insert(eventReports)
          .values({
            activityId: input.activityId,
            nodeId,
            formVersion: EVENT_REPORT_FORM_VERSION,
            report: input.report,
            source: "app",
            submittedBy: userId,
            submittedAt: at,
            updatedBy: userId,
            updatedAt: at,
          })
          .onConflictDoUpdate({
            target: eventReports.activityId,
            set: {
              formVersion: EVENT_REPORT_FORM_VERSION,
              report: input.report,
              updatedBy: userId,
              updatedAt: at,
              ...NOT_REVIEWED,
            },
          })
          .returning(),
      );
      if (!row) return yield* Effect.fail(new ORPCError("INTERNAL_SERVER_ERROR"));
      return storedReport(row);
    }),
    eventReportStatuses: Effect.fn("DiscoveryService.eventReportStatuses")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      yield* reportAccess(nodeId, context);
      const rows = yield* query(() =>
        db
          .select({
            activityId: eventReports.activityId,
            submittedAt: eventReports.submittedAt,
            source: eventReports.source,
            reviewedAt: eventReports.reviewedAt,
          })
          .from(eventReports)
          .where(eq(eventReports.nodeId, nodeId)),
      );
      return rows.map((row) => ({
        activityId: row.activityId,
        submittedAt: row.submittedAt.toISOString(),
        source: row.source,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      }));
    }),
    monthlyReport: Effect.fn("DiscoveryService.monthlyReport")(function* (
      input: { nodeId: string; month: string },
      context: AuthContext,
      externalStats: MonthlyExternalStats,
    ) {
      const target = yield* monthlyReportTarget(input, context);
      const [row] = yield* query(() =>
        db
          .select()
          .from(monthlyReports)
          .where(
            and(
              eq(monthlyReports.tenantId, target.tenantId),
              eq(monthlyReports.month, input.month),
            ),
          ),
      );
      const report = row ? storedMonthlyReport(row, input.nodeId) : null;
      const stats =
        target.canEdit && target.open
          ? yield* monthlyStats(
              { ...input, tenantId: target.tenantId, organizationId: target.organizationId },
              target.window,
              target.now,
              externalStats,
            )
          : (report?.stats ?? null);
      return {
        report,
        organizationId: target.organizationId,
        canEdit: target.canEdit,
        canReview: context.user?.role === "admin",
        open: target.open,
        closesAt: target.window.closesAt.toISOString(),
        stats,
      };
    }),
    saveMonthlyReport: Effect.fn("DiscoveryService.saveMonthlyReport")(function* (
      input: { nodeId: string; month: string; notes: string },
      context: AuthContext,
      externalStats: MonthlyExternalStats,
    ) {
      const target = yield* monthlyReportTarget(input, context);
      if (!target.canEdit) return yield* Effect.fail(new ORPCError("FORBIDDEN"));
      if (!target.open) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "This month's report closed at the end of the following month",
          }),
        );
      }
      const stats = yield* monthlyStats(
        { ...input, tenantId: target.tenantId, organizationId: target.organizationId },
        target.window,
        target.now,
        externalStats,
      );
      const userId = context.userId!;
      const at = new Date(target.now);
      const values = { notes: input.notes, ...stats, updatedBy: userId, updatedAt: at };
      const [row] = yield* query(() =>
        db
          .insert(monthlyReports)
          .values({
            tenantId: target.tenantId,
            month: input.month,
            ...values,
            submittedBy: userId,
            submittedByName: memberDisplayName(context.user?.name),
            submittedAt: at,
          })
          .onConflictDoUpdate({
            target: [monthlyReports.tenantId, monthlyReports.month],
            set: { ...values, ...NOT_REVIEWED },
          })
          .returning(),
      );
      if (!row) return yield* Effect.fail(new ORPCError("INTERNAL_SERVER_ERROR"));
      return storedMonthlyReport(row, input.nodeId);
    }),
    monthlyReportStatuses: Effect.fn("DiscoveryService.monthlyReportStatuses")(function* (
      nodeId: string,
      context: AuthContext,
    ) {
      const { tenantId, firstMonth } = yield* monthlyReportAccess(nodeId, context);
      const rows = yield* query(() =>
        db
          .select({
            month: monthlyReports.month,
            submittedAt: monthlyReports.submittedAt,
            updatedAt: monthlyReports.updatedAt,
            reviewedAt: monthlyReports.reviewedAt,
          })
          .from(monthlyReports)
          .where(and(eq(monthlyReports.tenantId, tenantId), gte(monthlyReports.month, firstMonth)))
          .orderBy(desc(monthlyReports.month)),
      );
      return {
        firstMonth,
        statuses: rows.map((row) => ({
          month: row.month,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
        })),
      };
    }),
    reviewMonthlyReport: Effect.fn("DiscoveryService.reviewMonthlyReport")(function* (
      input: { nodeId: string; month: string; reviewed: boolean; updatedAt: string },
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      const at = new Date(yield* Clock.currentTimeMillis);
      const tenantOfNode = db
        .select({ tenantId: nodes.tenantId })
        .from(nodes)
        .where(eq(nodes.id, input.nodeId));
      const report = and(
        inArray(monthlyReports.tenantId, tenantOfNode),
        eq(monthlyReports.month, input.month),
      );
      const rows = yield* query(() =>
        db
          .update(monthlyReports)
          .set(reviewPatch(input.reviewed, context.userId!, at))
          .where(and(report, readVersion(monthlyReports.updatedAt, input.updatedAt)))
          .returning({ reviewedAt: monthlyReports.reviewedAt }),
      );
      if (rows.length) return yield* reviewResult(rows, true);
      const existing = yield* query(() =>
        db.select({ month: monthlyReports.month }).from(monthlyReports).where(report).limit(1),
      );
      return yield* reviewResult(rows, existing.length > 0);
    }),
    reviewEventReport: Effect.fn("DiscoveryService.reviewEventReport")(function* (
      input: { activityId: string; reviewed: boolean; updatedAt: string },
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      const at = new Date(yield* Clock.currentTimeMillis);
      const report = eq(eventReports.activityId, input.activityId);
      const rows = yield* query(() =>
        db
          .update(eventReports)
          .set(reviewPatch(input.reviewed, context.userId!, at))
          .where(and(report, readVersion(eventReports.updatedAt, input.updatedAt)))
          .returning({ reviewedAt: eventReports.reviewedAt }),
      );
      if (rows.length) return yield* reviewResult(rows, true);
      const existing = yield* query(() =>
        db
          .select({ activityId: eventReports.activityId })
          .from(eventReports)
          .where(report)
          .limit(1),
      );
      return yield* reviewResult(rows, existing.length > 0);
    }),
    adminMonthlyReports: Effect.fn("DiscoveryService.adminMonthlyReports")(function* (
      month: string,
      context: AuthContext,
    ) {
      yield* requireAdmin(context);
      const now = yield* Clock.currentTimeMillis;
      const window = reportMonthWindow(month);
      if (!isReportableMonth(month) || window.from.getTime() > now) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", { message: "No reports are due for this month" }),
        );
      }
      const candidates = yield* query(() =>
        db
          .select({
            tenantId: tenants.id,
            organizationId: tenants.orgId,
            name: tenants.name,
            nodeId: nodes.id,
            nodeName: nodes.name,
            startedAt: sql<Date>`coalesce(${nodes.activatedAt}, ${nodes.createdAt})`.mapWith(
              (value: string | Date) => new Date(value),
            ),
          })
          .from(tenants)
          .innerJoin(nodes, eq(nodes.tenantId, tenants.id))
          .where(
            and(
              eq(tenants.status, "active"),
              isNull(tenants.deletedAt),
              isNotNull(tenants.orgId),
              listedNode,
            ),
          ),
      );
      const communities = new Map<
        string,
        {
          tenantId: string;
          organizationId: string;
          name: string;
          nodeId: string;
          nodeName: string;
          startedAt: Date;
        }
      >();
      for (const candidate of candidates) {
        if (!candidate.organizationId) continue;
        const known = communities.get(candidate.tenantId);
        const linkFirst =
          !known ||
          candidate.nodeName.localeCompare(known.nodeName) < 0 ||
          (candidate.nodeName === known.nodeName && candidate.nodeId < known.nodeId);
        communities.set(candidate.tenantId, {
          tenantId: candidate.tenantId,
          organizationId: candidate.organizationId,
          name: candidate.name,
          nodeId: linkFirst ? candidate.nodeId : (known?.nodeId ?? candidate.nodeId),
          nodeName: linkFirst ? candidate.nodeName : (known?.nodeName ?? candidate.nodeName),
          startedAt:
            known && known.startedAt < candidate.startedAt ? known.startedAt : candidate.startedAt,
        });
      }
      const expected = [...communities.values()].filter(
        (community) => firstReportMonth(community.startedAt) <= month,
      );
      const tenantIds = expected.map((community) => community.tenantId);
      if (tenantIds.length === 0) return [];
      const nowIso = new Date(now).toISOString();
      const data = discoveryActivities.data;
      const startsAt = sql`(${data}->>'startsAt')::timestamptz`;
      const endsAt = sql`coalesce((${data}->>'endsAt')::timestamptz, ${startsAt})`;
      const [reports, events] = yield* Effect.all([
        query(() =>
          db
            .select()
            .from(monthlyReports)
            .where(
              and(inArray(monthlyReports.tenantId, tenantIds), eq(monthlyReports.month, month)),
            ),
        ),
        query(() =>
          db
            .select({
              tenantId: nodes.tenantId,
              ended: sql<number>`count(*)::int`,
              reported: sql<number>`count(${eventReports.activityId})::int`,
              toReview: sql<number>`(count(${eventReports.activityId}) filter (where ${eventReports.reviewedAt} is null))::int`,
            })
            .from(discoveryActivities)
            .innerJoin(nodes, eq(nodes.id, discoveryActivities.ownerNodeId))
            .leftJoin(eventReports, eq(eventReports.activityId, discoveryActivities.id))
            .where(
              and(
                inArray(nodes.tenantId, tenantIds),
                shownActivity(nowIso),
                sql`${data}->>'kind' = 'event'`,
                sql`${startsAt} >= ${window.from.toISOString()}::timestamptz`,
                sql`${startsAt} < ${window.to.toISOString()}::timestamptz`,
                sql`${endsAt} <= ${nowIso}::timestamptz`,
              ),
            )
            .groupBy(nodes.tenantId),
        ),
      ]);
      const reportByTenant = new Map(reports.map((row) => [row.tenantId, row]));
      const eventsByTenant = new Map(events.map(({ tenantId, ...counts }) => [tenantId, counts]));
      return expected
        .map((community) => {
          const row = reportByTenant.get(community.tenantId);
          return {
            organizationId: community.organizationId,
            name: community.name,
            nodeId: community.nodeId,
            report: row ? storedMonthlyReport(row, community.nodeId) : null,
            events: eventsByTenant.get(community.tenantId) ?? {
              ended: 0,
              reported: 0,
              toReview: 0,
            },
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }),
  };
}
export type DiscoveryService = ReturnType<typeof createDiscovery>;
export class DiscoveryTag extends Context.Service<DiscoveryTag, DiscoveryService>()(
  "api/Discovery",
) {}
export const DiscoveryLive = (config: DiscoveryConfig = {}) =>
  Layer.effect(
    DiscoveryTag,
    Effect.gen(function* () {
      return createDiscovery(yield* DatabaseTag, config);
    }),
  );

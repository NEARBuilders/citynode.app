import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Clock, Context, DateTime, Effect, Layer, Schedule } from "effect";
import { z } from "zod";
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
  nodes,
  placeAliases,
  places,
  tenants,
} from "../db/schema";
import type {
  DiscoveryActivity,
  DiscoveryMeasurement,
  DiscoveryProfile,
  EventReport,
  PublicActivity,
  StoredDiscoveryProfile,
} from "../discovery-contract";
import { EVENT_REPORT_FORM_VERSION } from "../discovery-contract";
import type { FeatureArea } from "../feature-areas";
import type { AuthPluginContext as AuthContext } from "../lib/auth-types.gen";
import { toOrpcError } from "../lib/errors";
import { resolveTeamAccess } from "../team-access-policy";
import {
  type GeocodeService,
  GeocodeTag,
  profilePlace,
  shouldGeocodeProfile,
} from "./discovery-geocode";
import {
  createLumaCalendars,
  describeLumaFailure,
  type LumaEvent,
  lumaEventSchema,
} from "./discovery-luma";
import { lumaWebhookSchema, verifyLumaWebhook } from "./luma-webhook";
import { nodeKindOf } from "./nodes";
import { createPlaceMatcher, type PlaceMatcher } from "./place-match";

const EVENTS_AREA: FeatureArea = "events";

export type DiscoveryEffect<T> = Effect.Effect<T, ORPCError<string, unknown>>;

function storedReport(row: typeof eventReports.$inferSelect) {
  return {
    activityId: row.activityId,
    formVersion: row.formVersion,
    report: row.report,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

function lumaVenue(event: LumaEvent) {
  return (
    (event.location_visibility === "public"
      ? event.geo_address_json?.full_address || event.geo_address_json?.city_state
      : null
    )?.slice(0, 240) || "See Luma for location details"
  );
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

function createDiscovery(db: Database, config: DiscoveryConfig, geocode: GeocodeService) {
  const luma = createLumaCalendars(config.lumaKeys ?? "");
  const lumaMainCalendarId = config.lumaMainCalendarId?.trim() ?? "";
  const lumaWebhookSecrets = (config.lumaWebhookSecrets ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);

  const query = <T>(run: () => Promise<T>): DiscoveryEffect<T> =>
    Effect.tryPromise({ try: run, catch: toOrpcError });

  let placeParents: { loadedAt: number; parents: Map<string, string | null> } | null = null;
  let placeMatcherCache: { loadedAt: number; matcher: PlaceMatcher } | null = null;

  function placeTree() {
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (!placeParents || now - placeParents.loadedAt > PLACE_TREE_TTL_MS) {
        const rows = yield* query(() =>
          db.select({ id: places.id, parentId: places.parentId }).from(places),
        );
        placeParents = {
          loadedAt: now,
          parents: new Map(rows.map((row) => [row.id, row.parentId] as const)),
        };
      }
      const parents = placeParents.parents;
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
        const children = new Map<string, string[]>();
        for (const [id, parentId] of parents)
          if (parentId) children.set(parentId, [...(children.get(parentId) ?? []), id]);
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
          const placeId =
            activity.placeId ??
            (activity.ownerNodeId ? placeOfNode.get(activity.ownerNodeId) : undefined);
          return placeId ? ancestors(placeId).flatMap((id) => nodesByPlace.get(id) ?? []) : [];
        },
      };
    });
  }

  function placeMatcher() {
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (placeMatcherCache && now - placeMatcherCache.loadedAt <= PLACE_MATCHER_TTL_MS)
        return placeMatcherCache.matcher;
      const [rows, aliases] = yield* Effect.all([
        query(() =>
          db
            .select({
              id: places.id,
              parentId: places.parentId,
              name: places.name,
              label: places.label,
              boundary: places.boundary,
            })
            .from(places),
        ),
        query(() =>
          db
            .select({ value: placeAliases.value, placeId: placeAliases.placeId })
            .from(placeAliases)
            .where(sql`${placeAliases.kind} <> 'geonames'`),
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
  }

  function requireAdmin(context: AuthContext): DiscoveryEffect<void> {
    if (!context.userId || !context.user) return Effect.fail(new ORPCError("UNAUTHORIZED"));
    if (context.user.role !== "admin") return Effect.fail(new ORPCError("FORBIDDEN"));
    return Effect.void;
  }

  function nodeAccess(nodeId: string, context: AuthContext, area?: FeatureArea) {
    return Effect.gen(function* () {
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
      if (context.user.role === "admin") return { record, level: "editor" as const, manager: true };
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
  }

  function authorize(nodeId: string, context: AuthContext, area?: FeatureArea) {
    return Effect.gen(function* () {
      const { record, level } = yield* nodeAccess(nodeId, context, area);
      if (level !== "editor") {
        return yield* Effect.fail(new ORPCError("FORBIDDEN"));
      }
      return record;
    });
  }

  function requireCurator(context: AuthContext): DiscoveryEffect<void> {
    return Effect.gen(function* () {
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
  }

  function eligibleProfiles(ids?: string[]) {
    return Effect.gen(function* () {
      if (ids?.length === 0) return [];
      return yield* query(() =>
        db
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
          ),
      );
    });
  }

  function eligibleProfile(nodeId: string | null) {
    return Effect.gen(function* () {
      if (!nodeId) return null;
      const rows = yield* eligibleProfiles([nodeId]);
      return rows[0]?.profile ?? null;
    });
  }

  function activityById(id: string) {
    return Effect.gen(function* () {
      const [row] = yield* query(() =>
        db.select().from(discoveryActivities).where(eq(discoveryActivities.id, id)),
      );
      return row?.data ?? null;
    });
  }

  function publicActivity(id: string) {
    return Effect.gen(function* () {
      const activity = yield* activityById(id);
      if (
        !activity ||
        activity.status === "draft" ||
        activity.luma?.available === false ||
        activity.luma?.hidden === true ||
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
  }

  function list(input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
    nodeId?: string;
  }) {
    return Effect.gen(function* () {
      yield* Effect.forkDetach(syncDueLuma);
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
          .leftJoin(
            discoveryProfiles,
            eq(discoveryActivities.ownerNodeId, discoveryProfiles.nodeId),
          )
          .leftJoin(nodes, eq(nodes.id, discoveryProfiles.nodeId))
          .leftJoin(tenants, eq(nodes.tenantId, tenants.id))
          .where(
            and(
              or(
                and(
                  eq(tenants.status, "active"),
                  sql`${discoveryProfiles.data}->>'published' = 'true'`,
                ),
                and(
                  isNull(discoveryActivities.ownerNodeId),
                  isNotNull(discoveryActivities.placeId),
                ),
              ),
              sql`${discoveryActivities.data}->>'status' = 'published'`,
              sql`${discoveryActivities.data}->'luma'->>'hidden' IS DISTINCT FROM 'true'`,
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
              `${node.name} ${profile.location}`
                .toLowerCase()
                .includes(input.query.toLowerCase())) &&
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
              ? "Upcoming event"
              : recent
                ? "Recently active"
                : "Quiet lately",
            events: events
              .slice(0, 3)
              .map((a) => ({ ...a, nodeIds: a.nodeIds.filter((id) => eligible.has(id)) })),
            updates: updates.slice(0, 3),
            name: node.name,
            slug: node.slug,
            parentId: node.parentId,
            kind: nodeKindOf(node.metadata),
          };
        })
        .filter((p) => (!input.active || p.active) && (!input.upcoming || p.upcoming))
        .sort((a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId));
    });
  }

  function directory(input: {
    query?: string;
    region?: string;
    active?: boolean;
    upcoming?: boolean;
  }) {
    return Effect.gen(function* () {
      const listed = yield* list(input);
      if (input.region || input.active || input.upcoming) return listed;
      const rows = yield* query(() =>
        db
          .select({ node: nodes })
          .from(nodes)
          .innerJoin(tenants, eq(nodes.tenantId, tenants.id))
          .leftJoin(discoveryProfiles, eq(discoveryProfiles.nodeId, nodes.id))
          .where(and(eq(tenants.status, "active"), isNull(discoveryProfiles.nodeId))),
      );
      const search = input.query?.toLowerCase();
      const basic = rows
        .filter(({ node }) => !search || node.name.toLowerCase().includes(search))
        .map(({ node }) => ({
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
          kind: nodeKindOf(node.metadata),
        }));
      return [...listed, ...basic].sort(
        (a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId),
      );
    });
  }

  function saveActivity(
    input: Omit<DiscoveryActivity, "id" | "luma" | "placeId"> & { id?: string },
    context: AuthContext,
  ) {
    return Effect.gen(function* () {
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
            if (fields.some((field) => input[field] !== previous[field]))
              throw new ORPCError("BAD_REQUEST", {
                message: "Edit this event in Luma. Changes appear here automatically.",
              });
            if (!previous.luma.available && input.status !== "draft")
              throw new ORPCError("BAD_REQUEST", {
                message: "This event is no longer public on its Luma calendar.",
              });
          }
          const data: DiscoveryActivity = {
            ...input,
            luma: previous?.luma
              ? { ...previous.luma, hidden: input.status !== "published" }
              : undefined,
            id: input.id ?? crypto.randomUUID(),
            nodeIds: [...new Set(input.nodeIds)],
            url: canonicalActivityUrl(input.url),
          };
          const [duplicate] = await tx
            .select()
            .from(discoveryActivities)
            .where(eq(discoveryActivities.canonicalUrl, data.url));
          if (duplicate && duplicate.id !== data.id)
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
  }

  function syncLuma(input: { nodeId: string; calendarId: string }, actorId?: string) {
    return query(() =>
      db.transaction(async (tx) => {
        await tx.select().from(nodes).where(eq(nodes.id, input.nodeId)).for("update");
        const [connection] = await tx
          .select()
          .from(discoveryLumaConnections)
          .where(eq(discoveryLumaConnections.nodeId, input.nodeId));
        if (
          !actorId &&
          (!connection ||
            connection.calendarId !== input.calendarId ||
            connection.nextAttemptAt.getTime() > Date.now())
        )
          return { imported: 0, updated: 0, withdrawn: 0, skipped: 0 };
        const snapshot = await luma.snapshot(input.calendarId);
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
        const syncedAt = new Date().toISOString();
        for (const event of snapshot.events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          const previous = importedById.get(event.id);
          const data: DiscoveryActivity = {
            id: previous?.id ?? crypto.randomUUID(),
            ownerNodeId: input.nodeId,
            nodeIds: previous?.data.nodeIds ?? [input.nodeId],
            kind: "event",
            title: event.name.slice(0, 160),
            summary: "Event details and registration are managed on Luma.",
            url: canonicalActivityUrl(event.url),
            source: `Luma · ${snapshot.calendar.name}`.slice(0, 120),
            publishedAt: new Date(event.created_at).toISOString(),
            startsAt: new Date(event.start_at).toISOString(),
            endsAt: new Date(event.end_at).toISOString(),
            timezone: event.timezone,
            venue: lumaVenue(event),
            status: (previous?.data.luma?.hidden ?? true) ? "draft" : "published",
            luma: {
              calendarId: input.calendarId,
              eventId: event.id,
              syncedAt,
              available: true,
              hidden: previous?.data.luma?.hidden ?? true,
            },
          };
          const [duplicate] = await tx
            .select()
            .from(discoveryActivities)
            .where(
              and(
                eq(discoveryActivities.canonicalUrl, data.url),
                eq(discoveryActivities.ownerNodeId, input.nodeId),
              ),
            );
          if (duplicate && duplicate.id !== data.id) {
            result.skipped++;
            continue;
          }
          const saved = await tx
            .insert(discoveryActivities)
            .values({ id: data.id, ownerNodeId: input.nodeId, canonicalUrl: data.url, data })
            .onConflictDoNothing()
            .returning();
          if (previous) {
            await tx
              .update(discoveryActivities)
              .set({ data, canonicalUrl: data.url })
              .where(eq(discoveryActivities.id, previous.id));
            result.updated++;
          } else if (saved.length) result.imported++;
          else {
            result.skipped++;
          }
        }
        for (const row of existing) {
          if (!row.data.luma || seen.has(row.data.luma.eventId)) continue;
          await tx
            .update(discoveryActivities)
            .set({
              data: {
                ...row.data,
                status: "draft",
                luma: { ...row.data.luma, syncedAt, available: false },
              },
            })
            .where(eq(discoveryActivities.id, row.id));
          result.withdrawn++;
        }
        await tx
          .insert(discoveryLumaConnections)
          .values({
            nodeId: input.nodeId,
            calendarId: input.calendarId,
            calendarName: snapshot.calendar.name,
            syncedAt: new Date(),
            nextAttemptAt: new Date(Date.now() + 5 * 60_000),
            error: null,
          })
          .onConflictDoUpdate({
            target: discoveryLumaConnections.nodeId,
            set: {
              calendarId: input.calendarId,
              calendarName: snapshot.calendar.name,
              syncedAt: new Date(),
              nextAttemptAt: new Date(Date.now() + 5 * 60_000),
              error: null,
            },
          });
        if (actorId)
          await tx.insert(discoveryHistory).values({
            nodeId: input.nodeId,
            targetId: input.calendarId,
            actorId,
            action: `Luma connected: ${result.imported} imported, ${result.updated} updated, ${result.withdrawn} withdrawn`,
          });
        return result;
      }),
    );
  }

  function upsertPlaceEvent(event: LumaEvent, calendarId: string) {
    return Effect.gen(function* () {
      const matcher = yield* placeMatcher();
      const id = lumaPlaceActivityId(event.id);
      const match = matcher.match({
        coordinate: event.coordinate ?? null,
        city: event.geo_address_json?.city,
        region: event.geo_address_json?.region,
        country: event.geo_address_json?.country,
      });
      const placeId = match?.placeId ?? null;
      const syncedAt = new Date(yield* Clock.currentTimeMillis).toISOString();
      return yield* query(() =>
        db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(discoveryActivities)
            .where(eq(discoveryActivities.id, id))
            .for("update");
          const hidden = row?.data.luma?.hidden === true;
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
            status: hidden ? "draft" : "published",
            luma: {
              calendarId,
              eventId: event.id,
              syncedAt,
              available: true,
              ...(hidden ? { hidden } : {}),
              placeMatch: match?.by ?? "none",
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
  }

  function removePlaceEvent(eventId: string) {
    return query(() =>
      db
        .delete(discoveryActivities)
        .where(
          and(
            eq(discoveryActivities.id, lumaPlaceActivityId(eventId)),
            isNull(discoveryActivities.ownerNodeId),
          ),
        ),
    ).pipe(Effect.asVoid);
  }

  function receiveLumaWebhook(input: { signature: string | null; rawBody: string }) {
    return Effect.gen(function* () {
      if (!lumaMainCalendarId || lumaWebhookSecrets.length === 0)
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
      if (type === "event.canceled") {
        yield* removePlaceEvent(data.id);
        return { result: "removed" as const };
      }
      if (type === "calendar.event.added" && data.platform !== "luma")
        return { result: "ignored" as const };
      const raw =
        type === "calendar.event.added"
          ? yield* query(() => luma.event(lumaMainCalendarId, data.id))
          : data;
      const visibility = z.object({ visibility: z.string() }).safeParse(raw);
      if (!raw || (visibility.success && visibility.data.visibility !== "public")) {
        yield* removePlaceEvent(data.id);
        return { result: "removed" as const };
      }
      const event = lumaEventSchema.safeParse(raw);
      if (!event.success || Date.parse(event.data.end_at) < Date.parse(event.data.start_at)) {
        yield* Effect.logWarning(`[Discovery] Ignored invalid Luma webhook event ${data.id}`);
        return { result: "ignored" as const };
      }
      const saved = yield* upsertPlaceEvent(event.data, lumaMainCalendarId);
      return { result: saved.placeId ? ("associated" as const) : ("unmatched" as const) };
    });
  }

  function backfillLumaPlaceEvents(context: AuthContext) {
    return Effect.gen(function* () {
      yield* requireAdmin(context);
      if (!lumaMainCalendarId)
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", { message: "No main Luma calendar is configured." }),
        );
      const snapshot = yield* query(() => luma.snapshot(lumaMainCalendarId));
      const result = { imported: 0, updated: 0, unmatched: 0 };
      for (const event of snapshot.events) {
        const saved = yield* upsertPlaceEvent(event, lumaMainCalendarId);
        if (saved.created) result.imported++;
        else result.updated++;
        if (!saved.placeId) result.unmatched++;
      }
      return result;
    });
  }

  let syncing = false;
  const syncDueLuma: DiscoveryEffect<void> = Effect.suspend(() => {
    if (syncing) return Effect.void;
    syncing = true;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const due = yield* query(() =>
        db
          .select()
          .from(discoveryLumaConnections)
          .where(
            lt(
              discoveryLumaConnections.nextAttemptAt,
              DateTime.toDateUtc(DateTime.makeUnsafe(now)),
            ),
          ),
      );
      for (const connection of due) {
        const retryAt = yield* Clock.currentTimeMillis;
        yield* syncLuma(connection).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              `[Discovery] Luma sync failed for node ${connection.nodeId} calendar ${connection.calendarId}: ${describeLumaFailure(error)}`,
            ),
          ),
          Effect.catch(() =>
            query(() =>
              db
                .update(discoveryLumaConnections)
                .set({
                  error:
                    "Luma is temporarily unavailable. Showing the last saved events; we’ll retry automatically.",
                  nextAttemptAt: DateTime.toDateUtc(DateTime.makeUnsafe(retryAt + 5 * 60_000)),
                })
                .where(
                  and(
                    eq(discoveryLumaConnections.nodeId, connection.nodeId),
                    eq(discoveryLumaConnections.calendarId, connection.calendarId),
                  ),
                ),
            ),
          ),
        );
      }
    }).pipe(Effect.ensuring(Effect.sync(() => (syncing = false))));
  });

  return {
    directory,
    lumaCalendars: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
        yield* authorize(nodeId, context, EVENTS_AREA);
        const [connection] = yield* query(() =>
          db
            .select()
            .from(discoveryLumaConnections)
            .where(eq(discoveryLumaConnections.nodeId, nodeId)),
        );
        return {
          ...(yield* query(() => luma.list())),
          connection: connection
            ? {
                calendarId: connection.calendarId,
                calendarName: connection.calendarName,
                syncedAt: connection.syncedAt.toISOString(),
                error: connection.error,
              }
            : null,
        };
      }),
    syncDueLuma,
    receiveLumaWebhook,
    backfillLumaPlaceEvents,
    importLuma: (input: { nodeId: string; calendarId: string }, context: AuthContext) =>
      Effect.gen(function* () {
        yield* authorize(input.nodeId, context, EVENTS_AREA);
        return yield* syncLuma(input, context.userId!);
      }),
    disconnectLuma: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
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
              .where(eq(discoveryActivities.ownerNodeId, nodeId));
            for (const row of rows)
              if (row.data.luma)
                await tx
                  .update(discoveryActivities)
                  .set({
                    data: {
                      ...row.data,
                      status: "draft",
                      luma: { ...row.data.luma, available: false },
                    },
                  })
                  .where(eq(discoveryActivities.id, row.id));
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
    track: (input: DiscoveryMeasurement, context: AuthContext) =>
      Effect.gen(function* () {
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
    metrics: (context: AuthContext) =>
      Effect.gen(function* () {
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
    eventStats: (context: AuthContext) =>
      Effect.gen(function* () {
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
            .where(
              and(
                isNotNull(discoveryActivities.ownerNodeId),
                sql`${data}->>'status' = 'published'`,
                sql`${data}->'luma'->>'hidden' IS DISTINCT FROM 'true'`,
                sql`${data}->'luma'->>'available' IS DISTINCT FROM 'false'`,
                sql`(${data}->>'publishedAt')::timestamptz <= ${now}`,
              ),
            )
            .groupBy(discoveryActivities.ownerNodeId),
        ).pipe(
          Effect.map((rows) =>
            rows.flatMap(({ nodeId, ...row }) => (nodeId ? [{ ...row, nodeId }] : [])),
          ),
        );
      }),
    studio: (context: AuthContext) =>
      Effect.gen(function* () {
        yield* requireCurator(context);
        const isAdmin = context.user?.role === "admin";
        const reports = isAdmin
          ? yield* query(() =>
              db
                .select()
                .from(discoveryReports)
                .orderBy(desc(discoveryReports.createdAt))
                .limit(200),
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
    setCurator: (input: { userId: string; enabled: boolean }, context: AuthContext) =>
      Effect.gen(function* () {
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
    feature: (input: { nodeId: string; label: string; expiresAt: string }, context: AuthContext) =>
      Effect.gen(function* () {
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
    report: (input: {
      targetId: string;
      kind: "profile" | "activity";
      reason: string;
      token: string;
    }) =>
      Effect.gen(function* () {
        const activity = input.kind === "activity" ? yield* publicActivity(input.targetId) : null;
        const lockId = input.kind === "profile" ? input.targetId : (activity?.ownerNodeId ?? null);
        if (input.kind === "profile" ? !(yield* eligibleProfile(input.targetId)) : !activity) {
          return yield* Effect.fail(new ORPCError("NOT_FOUND"));
        }
        yield* query(() =>
          db.transaction(async (tx) => {
            if (lockId)
              await tx
                .select({ id: nodes.id })
                .from(nodes)
                .where(eq(nodes.id, lockId))
                .for("update");
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
    moderate: (
      input: { reportId: string; action: "dismiss" | "unpublish"; note: string },
      context: AuthContext,
    ) =>
      Effect.gen(function* () {
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
                      luma: row.data.luma ? { ...row.data.luma, hidden: true } : undefined,
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
    history: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
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
    setLumaVisibility: (
      input: { nodeId: string; activityId: string; show: boolean },
      context: AuthContext,
    ) =>
      Effect.gen(function* () {
        yield* authorize(input.nodeId, context, EVENTS_AREA);
        return yield* query(() =>
          db.transaction(async (tx) => {
            await tx.select().from(nodes).where(eq(nodes.id, input.nodeId)).for("update");
            const [row] = await tx
              .select()
              .from(discoveryActivities)
              .where(
                and(
                  eq(discoveryActivities.id, input.activityId),
                  eq(discoveryActivities.ownerNodeId, input.nodeId),
                ),
              )
              .for("update");
            if (!row) throw new ORPCError("NOT_FOUND");
            if (!row.data.luma) throw new ORPCError("BAD_REQUEST", { message: "Not a Luma event" });
            if (input.show && !row.data.luma.available)
              throw new ORPCError("BAD_REQUEST", {
                message: "This event is no longer public on its Luma calendar.",
              });
            const data: DiscoveryActivity = {
              ...row.data,
              ownerNodeId: input.nodeId,
              status: input.show ? "published" : "draft",
              luma: { ...row.data.luma, hidden: !input.show },
            };
            await tx
              .update(discoveryActivities)
              .set({ data })
              .where(eq(discoveryActivities.id, row.id));
            await tx.insert(discoveryHistory).values({
              nodeId: input.nodeId,
              targetId: row.id,
              actorId: context.userId!,
              action: input.show ? "Luma event shown" : "Luma event hidden",
            });
            return data;
          }),
        );
      }),
    activities: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
        const { level, manager } = yield* nodeAccess(nodeId, context, EVENTS_AREA);
        if (!level) {
          return yield* Effect.fail(new ORPCError("FORBIDDEN"));
        }
        const rows = yield* query(() =>
          db.select().from(discoveryActivities).where(eq(discoveryActivities.ownerNodeId, nodeId)),
        );
        const activities: DiscoveryActivity[] = rows.map((r) => ({
          ...r.data,
          ownerNodeId: nodeId,
        }));
        if (manager) return activities;
        if (level === "editor") return activities.filter((activity) => activity.kind === "event");
        return activities.filter(
          (activity) => activity.status !== "draft" && !activity.luma?.hidden,
        );
      }),
    eventOrganization: (eventId: string) =>
      Effect.gen(function* () {
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
    organizationEvents: (organizationIds: string[]) =>
      Effect.gen(function* () {
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
    activity: (id: string) =>
      Effect.gen(function* () {
        yield* Effect.forkDetach(syncDueLuma);
        return yield* publicActivity(id);
      }),
    get: (nodeId: string) =>
      Effect.gen(function* () {
        const results = yield* list({ nodeId });
        return results[0] ?? null;
      }),
    profile: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
        yield* authorize(nodeId, context, EVENTS_AREA);
        const [row] = yield* query(() =>
          db.select().from(discoveryProfiles).where(eq(discoveryProfiles.nodeId, nodeId)),
        );
        return row?.data ?? null;
      }),
    saveProfile: (input: DiscoveryProfile, context: AuthContext) =>
      Effect.gen(function* () {
        const record = yield* authorize(input.nodeId, context);
        const [existing] = yield* query(() =>
          db.select().from(discoveryProfiles).where(eq(discoveryProfiles.nodeId, input.nodeId)),
        );
        const previous = existing?.data;
        const geocodedLocation =
          input.geocodedLocation !== undefined
            ? input.geocodedLocation
            : (previous?.geocodedLocation ?? null);
        const kind = nodeKindOf(record.node.metadata);
        const place = profilePlace(input, kind);
        const missingBoundary = kind === "country" && !previous?.boundary;
        const stale = shouldGeocodeProfile({
          location: place,
          latitude: input.latitude,
          longitude: input.longitude,
          geocodedLocation,
        });
        let next: StoredDiscoveryProfile = {
          ...input,
          geocodedLocation,
          geocodeHint: null,
          boundary: previous?.boundary ?? null,
        };
        if (!place) {
          next = {
            ...next,
            latitude: null,
            longitude: null,
            geocodedLocation: null,
            geocodeHint: null,
            boundary: null,
          };
        } else if (stale || missingBoundary) {
          const geocoded = yield* geocode.geocode(place);
          if (geocoded.ok) {
            next = {
              ...next,
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              geocodedLocation: place,
              geocodeHint: null,
              boundary: kind === "country" ? (geocoded.boundary ?? null) : null,
            };
          } else if (stale) {
            next = {
              ...next,
              latitude: null,
              longitude: null,
              geocodedLocation: null,
              geocodeHint: geocoded.reason === "not_found" ? "not_found" : "unavailable",
              boundary: null,
            };
          }
        }
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
    eventReport: (activityId: string, context: AuthContext) =>
      Effect.gen(function* () {
        const activity = yield* activityById(activityId);
        if (!activity?.ownerNodeId || activity.kind !== "event") {
          return yield* Effect.fail(new ORPCError("NOT_FOUND"));
        }
        yield* authorize(activity.ownerNodeId, context, EVENTS_AREA);
        const [row] = yield* query(() =>
          db.select().from(eventReports).where(eq(eventReports.activityId, activityId)),
        );
        return row ? storedReport(row) : null;
      }),
    saveEventReport: (input: { activityId: string; report: EventReport }, context: AuthContext) =>
      Effect.gen(function* () {
        const activity = yield* activityById(input.activityId);
        if (!activity?.ownerNodeId || activity.kind !== "event") {
          return yield* Effect.fail(new ORPCError("NOT_FOUND"));
        }
        const ownerNodeId = activity.ownerNodeId;
        yield* authorize(ownerNodeId, context, EVENTS_AREA);
        const now = yield* Clock.currentTimeMillis;
        const end = activity.endsAt ?? activity.startsAt;
        if (activity.status === "cancelled" || !end || Date.parse(end) > now) {
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
              nodeId: ownerNodeId,
              formVersion: EVENT_REPORT_FORM_VERSION,
              report: input.report,
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
              },
            })
            .returning(),
        );
        if (!row) return yield* Effect.fail(new ORPCError("INTERNAL_SERVER_ERROR"));
        return storedReport(row);
      }),
    eventReportStatuses: (nodeId: string, context: AuthContext) =>
      Effect.gen(function* () {
        yield* authorize(nodeId, context, EVENTS_AREA);
        const rows = yield* query(() =>
          db
            .select({ activityId: eventReports.activityId, submittedAt: eventReports.submittedAt })
            .from(eventReports)
            .where(eq(eventReports.nodeId, nodeId)),
        );
        return rows.map((row) => ({
          activityId: row.activityId,
          submittedAt: row.submittedAt.toISOString(),
        }));
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
      const service = createDiscovery(yield* DatabaseTag, config, yield* GeocodeTag);
      yield* Effect.forkScoped(
        service.syncDueLuma.pipe(Effect.ignore, Effect.repeat(Schedule.spaced("60 seconds"))),
      );
      return service;
    }),
  );

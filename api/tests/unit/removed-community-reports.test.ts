import type { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { discoveryActivities, eventReports, places, tenants } from "@/db/schema";
import type { EventReport, PublicActivity } from "@/discovery-contract";
import { DiscoveryLive, type DiscoveryService, DiscoveryTag } from "@/services/discovery";
import { GeocodeTag } from "@/services/discovery-geocode";
import { NodesLive, type NodesService, NodesTag } from "@/services/nodes";
import { createServiceHarness, createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

type Tags = DiscoveryTag | NodesTag | DatabaseTag;

function freshLayer(): Layer.Layer<Tags, DatabaseError, never> {
  const temp = createTempDb("api-removed-community-");
  cleanup = temp.cleanup;
  const database = DatabaseLive(temp.url);
  const geocode = Layer.succeed(GeocodeTag, {
    geocode: () => Effect.succeed({ ok: false as const, reason: "unavailable" as const }),
    resetForTests: Effect.void,
  });
  return Layer.mergeAll(
    DiscoveryLive({}).pipe(Layer.provide(database), Layer.provide(geocode)),
    NodesLive.pipe(Layer.provide(database)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    Tags,
    DatabaseError,
    never
  >;
}

interface TestServices {
  discovery: DiscoveryService;
  nodes: NodesService;
  db: Database;
}

const { run } = createServiceHarness<
  TestServices,
  Tags,
  DatabaseError,
  ORPCError<string, unknown> | Error
>(
  Effect.gen(function* () {
    return { discovery: yield* DiscoveryTag, nodes: yield* NodesTag, db: yield* DatabaseTag };
  }),
);

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const report: EventReport = {
  format: "irl",
  socialLinks: ["https://example.com/post"],
  focus: "crypto",
  audiences: ["developers"],
  audienceOther: "",
  theme: "A hands-on build night",
  attendees: 42,
  slideLinks: [],
  kpis: ["40 attendees", "12 new members", ""],
  wentWell: "Great energy",
  improvements: "Start on time",
  talentAfter: "Follow-up office hours",
  talentDuring: "Mentors at each table",
  materialsNeeded: "",
  hadPartners: false,
  partners: "",
  nextActions: "Plan the next meetup",
  insights: "",
  mediaLinks: [],
};

const admin = { userId: "platform-admin", user: { id: "platform-admin", role: "admin" } } as never;

const ownerOf = (orgId: string) =>
  ({
    userId: `owner-${orgId}`,
    user: { id: `owner-${orgId}`, name: "Owner" },
    organization: { activeOrganizationId: orgId, member: { id: "member", role: "owner" } },
  }) as never;

function ownEvent(nodeId: string, title: string, url: string) {
  return {
    ownerNodeId: nodeId,
    nodeIds: [nodeId],
    kind: "event" as const,
    title,
    summary: "Meet the builders",
    url,
    source: "Community",
    publishedAt: ago(72),
    startsAt: ago(48),
    endsAt: ago(45),
    timezone: "UTC",
    venue: "Town Hall",
    status: "published" as const,
  };
}

const seed = ({ nodes, db }: TestServices) =>
  Effect.gen(function* () {
    const insertPlace = async (slug: string, parentId: string | null) => {
      const [row] = await db.insert(places).values({ slug, name: slug, parentId }).returning();
      return row!.id;
    };
    const region = yield* Effect.promise(() => insertPlace("region", null));
    const city = yield* Effect.promise(() => insertPlace("city", region));
    const start = (placeId: string, orgId: string) =>
      nodes.activateForPlace({ placeId, orgId, activatedBy: "a", joinCodeId: `join-${orgId}` });
    const covering = (yield* start(region, "org-region")).node;
    const removed = (yield* start(city, "org-city")).node;

    const placeEvent = async (title: string) => {
      const id = crypto.randomUUID();
      const data: PublicActivity = {
        ...ownEvent(removed.id, title, `https://luma.com/${id}`),
        id,
        ownerNodeId: null,
        placeId: city,
        nodeIds: [],
        source: "Luma",
      };
      await db
        .insert(discoveryActivities)
        .values({ id, ownerNodeId: null, placeId: city, canonicalUrl: data.url, data });
      return data;
    };

    return {
      city,
      covering,
      removed,
      reportedPlace: yield* Effect.promise(() => placeEvent("Reported meetup")),
      unreportedPlace: yield* Effect.promise(() => placeEvent("Open meetup")),
    };
  });

const reportThenRemove = (services: TestServices) =>
  Effect.gen(function* () {
    const { discovery, nodes } = services;
    const seeded = yield* seed(services);
    const owner = ownerOf("org-city");
    const reported = yield* discovery.saveActivity(
      ownEvent(seeded.removed.id, "Builders night", "https://example.com/night"),
      owner,
    );
    const unreported = yield* discovery.saveActivity(
      ownEvent(seeded.removed.id, "Quiet night", "https://example.com/quiet"),
      owner,
    );
    for (const activityId of [reported.id, seeded.reportedPlace.id]) {
      const saved = yield* discovery.saveEventReport({ activityId, report }, owner);
      yield* discovery.reviewEventReport(
        { activityId, reviewed: true, updatedAt: saved.updatedAt },
        admin,
      );
    }
    expect(yield* nodes.delete(seeded.removed.id)).toBe(true);
    return { ...seeded, reported, unreported };
  });

describe("removing a community that reported events", () => {
  it("keeps its reports with the removed community's tenant", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { db } = services;
        const { removed, reported, reportedPlace } = yield* reportThenRemove(services);

        const rows = yield* Effect.promise(() =>
          db.select().from(eventReports).orderBy(asc(eventReports.activityId)),
        );
        expect(rows.map((row) => row.activityId)).toEqual([reported.id, reportedPlace.id].sort());
        for (const row of rows) {
          expect(row).toMatchObject({
            nodeId: null,
            removedTenantId: removed.tenantId,
            reviewedBy: "platform-admin",
            report: { attendees: 42 },
          });
        }
        const [tenant] = yield* Effect.promise(() =>
          db.select().from(tenants).where(eq(tenants.id, removed.tenantId!)),
        );
        expect(tenant).toMatchObject({ orgId: "org-city", status: "pending_deletion" });
      }),
    );
  });

  it("keeps a reported own event as an unlisted draft and drops the rest", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { discovery, db } = services;
        const { reported, unreported, reportedPlace } = yield* reportThenRemove(services);

        const rows = yield* Effect.promise(() => db.select().from(discoveryActivities));
        const byId = new Map(rows.map((row) => [row.id, row]));
        expect(byId.has(unreported.id)).toBe(false);
        expect(byId.get(reported.id)).toMatchObject({
          ownerNodeId: null,
          data: { title: "Builders night", ownerNodeId: null, status: "draft" },
        });
        expect(yield* discovery.activity(reported.id)).toBeNull();
        expect(byId.get(reportedPlace.id)?.data.status).toBe("published");
      }),
    );
  });

  it("doesn't hand a reported place event to another community covering the place", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { discovery } = services;
        const { covering, reported, reportedPlace, unreportedPlace } =
          yield* reportThenRemove(services);
        const other = ownerOf("org-region");

        const listed = yield* discovery.activities(covering.id, other);
        expect(listed.map(({ id }) => id)).toEqual([unreportedPlace.id]);
        const adminList = yield* discovery.adminEvents(admin);
        expect(adminList.map(({ id }) => id)).toEqual([unreportedPlace.id]);
        for (const activityId of [reportedPlace.id, reported.id]) {
          for (const attempt of [
            Effect.asVoid(discovery.eventReport(activityId, other)),
            Effect.asVoid(discovery.saveEventReport({ activityId, report }, other)),
          ]) {
            const error = yield* attempt.pipe(Effect.flip, Effect.orDie);
            expect(error).toMatchObject({ code: "NOT_FOUND" });
          }
        }
        yield* discovery.saveEventReport({ activityId: unreportedPlace.id, report }, other);
      }),
    );
  });

  it("doesn't offer the place copy of a reported event to another community", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { discovery, nodes } = services;
        const { covering, removed, reportedPlace, unreportedPlace } = yield* seed(services);
        const owner = ownerOf("org-city");
        const own = yield* discovery.saveActivity(
          ownEvent(removed.id, reportedPlace.title, reportedPlace.url),
          owner,
        );
        yield* discovery.saveEventReport({ activityId: own.id, report }, owner);
        yield* nodes.delete(removed.id);
        const other = ownerOf("org-region");

        const listed = yield* discovery.activities(covering.id, other);
        expect(listed.map(({ id }) => id)).toEqual([unreportedPlace.id]);
        const adminList = yield* discovery.adminEvents(admin);
        expect(adminList.map(({ id }) => id)).toEqual([unreportedPlace.id]);
        const error = yield* discovery
          .saveEventReport({ activityId: reportedPlace.id, report }, other)
          .pipe(Effect.flip, Effect.orDie);
        expect(error).toMatchObject({ code: "NOT_FOUND" });
      }),
    );
  });

  it("leaves another community its own report on a place event with the same link", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { discovery, nodes } = services;
        const {
          covering: leaving,
          removed: staying,
          reportedPlace: placeCopy,
        } = yield* seed(services);
        const leavingOwner = ownerOf("org-region");
        const stayingOwner = ownerOf("org-city");
        const own = yield* discovery.saveActivity(
          ownEvent(leaving.id, placeCopy.title, placeCopy.url),
          leavingOwner,
        );
        yield* discovery.saveEventReport({ activityId: own.id, report }, leavingOwner);
        yield* discovery.saveEventReport({ activityId: placeCopy.id, report }, stayingOwner);
        yield* nodes.delete(leaving.id);

        const listed = yield* discovery.activities(staying.id, stayingOwner);
        expect(listed.map(({ id }) => id)).toContain(placeCopy.id);
        expect(yield* discovery.eventReport(placeCopy.id, stayingOwner)).toMatchObject({
          report: { report: { attendees: 42 } },
          canEdit: true,
        });
        const edited = yield* discovery.saveEventReport(
          { activityId: placeCopy.id, report: { ...report, attendees: 50 } },
          stayingOwner,
        );
        yield* discovery.reviewEventReport(
          { activityId: placeCopy.id, reviewed: true, updatedAt: edited.updatedAt },
          admin,
        );
        const adminRow = (yield* discovery.adminEvents(admin)).find(
          ({ id }) => id === placeCopy.id,
        );
        expect(adminRow).toMatchObject({
          nodeId: staying.id,
          reportSubmittedAt: edited.submittedAt,
          reportReviewedAt: expect.any(String),
        });
      }),
    );
  });

  it("lets the link of a kept event be used again", async () => {
    const layer = freshLayer();
    await run(layer, (services) =>
      Effect.gen(function* () {
        const { discovery, nodes } = services;
        const { city, reported } = yield* reportThenRemove(services);
        const restarted = (yield* nodes.activateForPlace({
          placeId: city,
          orgId: "org-restarted",
          activatedBy: "a",
          joinCodeId: "join-restarted",
        })).node;

        const again = yield* discovery.saveActivity(
          ownEvent(restarted.id, "Builders night", reported.url),
          ownerOf("org-restarted"),
        );
        expect(again.id).not.toBe(reported.id);
      }),
    );
  });
});

describe("removing a community without reports", () => {
  it("still deletes its events", async () => {
    await run(freshLayer(), (services) =>
      Effect.gen(function* () {
        const { discovery, nodes, db } = services;
        const { removed } = yield* seed(services);
        const event = yield* discovery.saveActivity(
          ownEvent(removed.id, "Builders night", "https://example.com/night"),
          ownerOf("org-city"),
        );
        yield* nodes.delete(removed.id);

        const rows = yield* Effect.promise(() =>
          db.select().from(discoveryActivities).where(eq(discoveryActivities.id, event.id)),
        );
        expect(rows).toEqual([]);
      }),
    );
  });
});

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

type StubCode = {
  id: string;
  eventId: string | null;
  eventName: string;
  createdAt: Date;
  expiresAt: Date;
  joined: Array<{ userId: string; createdAt: Date }>;
};

const codesByOrg = new Map<string, StubCode[]>();
const organizers = new Set<string>();
const memberships = new Map<string, Array<{ id: string; name: string }>>();
const failingStatus = new Set<string>();
const failingEventListings = new Set<string>();
const statusCalls: string[] = [];
const UPSTREAM_LIMIT = 20;

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

function deny() {
  return new ORPCError("FORBIDDEN", { message: "Not an organizer" });
}

function codeOutput(code: StubCode) {
  return {
    id: code.id,
    eventId: code.eventId,
    eventName: code.eventName,
    teamId: "event-team",
    role: "member",
    maxUses: 300,
    usedCount: code.joined.length,
    expiresAt: code.expiresAt,
    revokedAt: null,
    createdAt: code.createdAt,
  };
}

const authStub = {
  client: (context: unknown) => ({
    listOrganizations: async () =>
      (memberships.get(callerId(context)) ?? []).map((organization) => ({
        ...organization,
        slug: organization.id,
        status: "active",
      })),
    listOnboardingCodes: async (input: { organizationId?: string; eventId?: string }) => {
      const organizationId = input.organizationId ?? "";
      if (!organizers.has(`${organizationId}:${callerId(context)}`)) throw deny();
      if (input.eventId && failingEventListings.has(input.eventId)) {
        throw new Error("listing failed");
      }
      return (codesByOrg.get(organizationId) ?? [])
        .filter((code) => !input.eventId || code.eventId === input.eventId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, UPSTREAM_LIMIT)
        .map(codeOutput);
    },
    getOnboardingStatus: async (input: { codeId: string; organizationId?: string }) => {
      const organizationId = input.organizationId ?? "";
      if (!organizers.has(`${organizationId}:${callerId(context)}`)) throw deny();
      statusCalls.push(input.codeId);
      if (failingStatus.has(input.codeId)) throw new Error("status failed");
      const code = (codesByOrg.get(organizationId) ?? []).find((c) => c.id === input.codeId);
      if (!code) throw new ORPCError("NOT_FOUND");
      return {
        ...codeOutput(code),
        joined: code.joined.map((join) => ({
          ...join,
          userName: null,
          accountId: null,
        })),
      };
    },
  }),
  router: {},
};

const HOUR = 3_600_000;
const past = (hours: number) => new Date(Date.now() - hours * HOUR);

function eventInput(ownerNodeId: string, title: string, startsAt: Date) {
  return {
    ownerNodeId,
    nodeIds: [ownerNodeId],
    kind: "event" as const,
    title,
    summary: "Meet the builders",
    url: `https://example.com/events/${crypto.randomUUID()}`,
    source: "Community",
    publishedAt: new Date(startsAt.getTime() - 48 * HOUR).toISOString(),
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 3 * HOUR).toISOString(),
    timezone: "UTC",
    venue: "Town Hall",
    status: "published" as const,
  };
}

async function community(name = "Attendance city") {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `attendance-${id}`;
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `at-${id}.near`));
  const tenant = await provisioner.createTenant({ name, accountId: `at-${id}.near` });
  const node = await provisioner.createNode({
    name,
    slug: `attendance-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  const editor = await getPluginClient(orgContext(`editor-${id}`, org));
  const popUp = await provisioner.createNode({
    name: `${name} pop-up`,
    slug: `attendance-pop-up-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  const organizerId = `organizer-${id}`;
  organizers.add(`${org}:${organizerId}`);
  codesByOrg.set(org, []);
  return {
    org,
    name,
    addEvent: (title: string, startsAt: Date) =>
      editor.saveDiscoveryActivity(eventInput(node.id, title, startsAt)),
    addPopUpEvent: (title: string, startsAt: Date) =>
      editor.saveDiscoveryActivity(eventInput(popUp.id, title, startsAt)),
    closePopUp: async () =>
      (await getPluginClient(orgContext(`admin-${id}`, org, "admin"))).deleteNode({
        nodeId: popUp.id,
      }),
    organizer: () => client(organizerId),
  };
}

function client(userId: string) {
  return getPluginClient({
    ...authedContext(userId),
    reqHeaders: { cookie: `better-auth.session_token=${userId}` },
  });
}

function member(userId: string, ...organizations: Array<{ org: string; name: string }>) {
  memberships.set(
    userId,
    organizations.map((organization) => ({ id: organization.org, name: organization.name })),
  );
  return client(userId);
}

function addCode(
  org: string,
  eventId: string | null,
  eventName: string,
  joined: Array<[string, Date]>,
  createdAt = new Date(),
) {
  const code: StubCode = {
    id: `code-${crypto.randomUUID().slice(0, 8)}`,
    eventId,
    eventName,
    createdAt,
    expiresAt: past(1),
    joined: joined.map(([userId, at]) => ({ userId, createdAt: at })),
  };
  codesByOrg.get(org)!.push(code);
  return code;
}

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  failingStatus.clear();
  failingEventListings.clear();
  statusCalls.length = 0;
});

describe("confirming attendance from an organizer session", () => {
  it("lists distinct events newest first, deduplicated by event id, never by name or day", async () => {
    const city = await community();
    const memberId = `member-${crypto.randomUUID()}`;
    const day = new Date("2026-10-10T18:00:00.000Z");
    const first = await city.addEvent("Builders Night", day);
    const sameName = await city.addEvent("Builders Night", new Date("2026-10-10T20:00:00.000Z"));
    const overnight = await city.addEvent("Hack until dawn", new Date("2026-10-12T22:00:00.000Z"));
    addCode(city.org, first.id, "Builders Night", [[memberId, new Date("2026-10-10T18:30:00Z")]]);
    addCode(city.org, first.id, "Builders Night", [[memberId, new Date("2026-10-10T19:30:00Z")]]);
    addCode(city.org, sameName.id, "Builders Night", [
      [memberId, new Date("2026-10-10T20:15:00Z")],
    ]);
    addCode(city.org, overnight.id, "Hack until dawn", [
      [memberId, new Date("2026-10-12T23:50:00Z")],
    ]);
    addCode(city.org, overnight.id, "Hack until dawn", [
      [memberId, new Date("2026-10-13T00:20:00Z")],
      ["someone-else", new Date("2026-10-13T00:21:00Z")],
    ]);

    const summary = await (await city.organizer()).reconcileAttendance({
      organizationId: city.org,
    });
    expect(summary).toEqual({ events: 3, truncated: [], failed: [] });

    const record = await (await member(memberId, city)).getMyAttendance({
      organizationId: city.org,
    });
    expect(record.events.map((event) => [event.eventId, event.checkedInAt])).toEqual([
      [overnight.id, "2026-10-12T23:50:00.000Z"],
      [sameName.id, "2026-10-10T20:15:00.000Z"],
      [first.id, "2026-10-10T18:30:00.000Z"],
    ]);
    expect(record.events[0]).toMatchObject({
      eventName: "Hack until dawn",
      communityName: city.name,
      startsAt: overnight.startsAt,
    });
    expect(record.unclassified).toEqual([]);
    expect(record.communities).toEqual([
      expect.objectContaining({ organizationId: city.org, status: "synced", reasons: [] }),
    ]);
  });

  it("refuses members who aren't organizers and never trusts input about who joined", async () => {
    const city = await community();
    const event = await city.addEvent("Meetup", past(48));
    addCode(city.org, event.id, "Meetup", [["real-attendee", past(47)]]);
    const plain = await member("plain-member", city);

    await expect(plain.reconcileAttendance({ organizationId: city.org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      (await getPluginClient()).reconcileAttendance({ organizationId: city.org }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await (await city.organizer()).reconcileAttendance({
      organizationId: city.org,
      joined: [{ userId: "plain-member" }],
    } as never);
    expect(
      (await plain.getMyAttendance({ organizationId: city.org })).events.map((e) => e.eventId),
    ).toEqual([]);
  });

  it("only reads the caller's own history, and a community's only while they belong to it", async () => {
    const city = await community();
    const event = await city.addEvent("Meetup", past(48));
    addCode(city.org, event.id, "Meetup", [["alice-attendee", past(47)]]);
    await (await city.organizer()).reconcileAttendance({ organizationId: city.org });

    const bob = await member("bob-attendee", city);
    const bobView = await bob.getMyAttendance({
      organizationId: city.org,
      userId: "alice-attendee",
    } as never);
    expect(bobView.events).toEqual([]);

    const outsider = await member("outsider-attendee");
    await expect(outsider.getMyAttendance({ organizationId: city.org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      (await getPluginClient()).getMyAttendance({ organizationId: city.org }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("skips codes whose check-in count hasn't changed, and picks up new ones", async () => {
    const city = await community();
    const event = await city.addEvent("Weekly", past(72));
    const code = addCode(city.org, event.id, "Weekly", [["repeat-a", past(70)]]);
    const organizer = await city.organizer();

    await organizer.reconcileAttendance({ organizationId: city.org });
    expect(statusCalls).toEqual([code.id]);

    statusCalls.length = 0;
    await organizer.reconcileAttendance({ organizationId: city.org });
    expect(statusCalls).toEqual([]);

    code.joined.push({ userId: "repeat-b", createdAt: past(69) });
    await organizer.reconcileAttendance({ organizationId: city.org });
    expect(statusCalls).toEqual([code.id]);
    expect(
      (await member("repeat-b", city).then((c) => c.getMyAttendance({}))).events.map(
        (e) => e.eventId,
      ),
    ).toEqual([event.id]);
  });

  it("marks an event returning 20 or more codes as possibly truncated", async () => {
    const city = await community();
    const exactly = await city.addEvent("Exactly twenty", past(100));
    const more = await city.addEvent("Twenty one", past(90));
    const fewer = await city.addEvent("Nineteen", past(80));
    for (let i = 0; i < 20; i++) addCode(city.org, exactly.id, "Exactly twenty", []);
    for (let i = 0; i < 21; i++) addCode(city.org, more.id, "Twenty one", []);
    for (let i = 0; i < 19; i++) addCode(city.org, fewer.id, "Nineteen", []);
    addCode(city.org, more.id, "Twenty one", [["truncated-member", past(89)]], past(200));

    const summary = await (await city.organizer()).reconcileAttendance({
      organizationId: city.org,
    });
    expect(summary.truncated.sort()).toEqual([exactly.id, more.id].sort());

    const record = await (await member("truncated-member", city)).getMyAttendance({
      organizationId: city.org,
    });
    expect(record.events).toEqual([]);
    expect(record.communities[0]).toMatchObject({ status: "incomplete", reasons: ["truncated"] });
  });

  it("keeps confirmed history through failed reads, deleted codes and deleted events", async () => {
    const city = await community();
    const kept = await city.addEvent("Kept", past(300));
    const gone = await city.addPopUpEvent("Gone later", past(200));
    const code = addCode(city.org, kept.id, "Kept", [["keeper", past(299)]]);
    addCode(city.org, gone.id, "Gone later", [["keeper", past(199)]]);
    const organizer = await city.organizer();
    await organizer.reconcileAttendance({ organizationId: city.org });

    code.joined.push({ userId: "late", createdAt: past(298) });
    failingStatus.add(code.id);
    failingEventListings.add(gone.id);
    const summary = await organizer.reconcileAttendance({ organizationId: city.org });
    expect(summary.failed.sort()).toEqual([kept.id, gone.id].sort());

    const keeper = await member("keeper", city);
    let record = await keeper.getMyAttendance({ organizationId: city.org });
    expect(record.events.map((e) => e.eventId)).toEqual([gone.id, kept.id]);
    expect(record.communities[0]).toMatchObject({ status: "incomplete", reasons: ["failed"] });

    failingStatus.clear();
    failingEventListings.clear();
    codesByOrg.set(city.org, []);
    await city.closePopUp();
    await organizer.reconcileAttendance({ organizationId: city.org });

    record = await keeper.getMyAttendance({ organizationId: city.org });
    expect(record.events).toEqual([
      expect.objectContaining({ eventId: gone.id, eventName: "Gone later", startsAt: null }),
      expect.objectContaining({ eventId: kept.id, eventName: "Kept" }),
    ]);
    expect(record.communities[0]).toMatchObject({ status: "synced" });
  });

  it("shows codes without a community event as unclassified, outside the event list", async () => {
    const city = await community();
    await city.addEvent("Listed", past(50));
    addCode(city.org, null, "Legacy sign-up", [["legacy-member", past(500)]]);
    addCode(city.org, "not-a-city-node-event", "Hackathon sign-up", [["legacy-member", past(400)]]);
    await (await city.organizer()).reconcileAttendance({ organizationId: city.org });

    const record = await (await member("legacy-member", city)).getMyAttendance({
      organizationId: city.org,
    });
    expect(record.events).toEqual([]);
    expect(record.unclassified.map((row) => row.eventName)).toEqual([
      "Hackathon sign-up",
      "Legacy sign-up",
    ]);
  });

  it("reports events nobody has synced yet as incomplete, not as no events", async () => {
    const city = await community();
    await city.addEvent("Not synced", past(10));
    const record = await (await member("early-member", city)).getMyAttendance({
      organizationId: city.org,
    });
    expect(record.events).toEqual([]);
    expect(record.communities).toEqual([
      expect.objectContaining({ status: "incomplete", reasons: ["not_synced"], syncedAt: null }),
    ]);
  });

  it("keeps every community's history across communities, including ones the member left", async () => {
    const north = await community("North city");
    const south = await community("South city");
    const northEvent = await north.addEvent("North meetup", past(30));
    const southEvent = await south.addEvent("South meetup", past(20));
    addCode(north.org, northEvent.id, "North meetup", [["traveller", past(29)]]);
    addCode(south.org, southEvent.id, "South meetup", [["traveller", past(19)]]);
    await (await north.organizer()).reconcileAttendance({ organizationId: north.org });
    await (await south.organizer()).reconcileAttendance({ organizationId: south.org });

    const traveller = await member("traveller", south);
    const everywhere = await traveller.getMyAttendance({});
    expect(everywhere.events.map((e) => [e.communityName, e.eventName])).toEqual([
      ["South city", "South meetup"],
      ["North city", "North meetup"],
    ]);
    expect(everywhere.communities.map((c) => c.organizationId).sort()).toEqual(
      [north.org, south.org].sort(),
    );
    await expect(traveller.getMyAttendance({ organizationId: north.org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

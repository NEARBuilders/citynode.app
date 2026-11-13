import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const roles = new Map<string, string>();
const eventTeams = new Set<string>();
const memberships = new Map<string, Array<{ id: string; name: string; slug?: string }>>();
const joins = new Map<string, { redeemed: number; newMembers: number }>();
const codes = new Map<string, Array<{ id: string; eventId: string; joined: [string, Date][] }>>();
const organizationLookups = { failing: false, calls: 0 };
const NOW = "2026-12-10T12:00:00.000Z";

function membersOf(organizationId: string) {
  return [...roles.entries()]
    .filter(([key]) => key.startsWith(`${organizationId}:`))
    .map(([key, role]) => {
      const userId = key.slice(organizationId.length + 1);
      return {
        id: key,
        userId,
        organizationId,
        role,
        createdAt: new Date(0),
        user: {
          id: userId,
          name: `Name of ${userId}`,
          email: `${userId}@example.com`,
          image: null,
        },
      };
    });
}

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

function organizer(context: unknown, organizationId: string) {
  const key = `${organizationId}:${callerId(context)}`;
  const role = roles.get(key);
  return role === "owner" || role === "admin" || eventTeams.has(key);
}

function knownOrganizations() {
  return [...new Set([...roles.keys()].map((key) => key.slice(0, key.indexOf(":"))))];
}

const authStub = {
  client: (context: unknown) => ({
    adminListOrganizations: async ({ limit = 100, offset = 0 } = {}) => {
      organizationLookups.calls += 1;
      if (organizationLookups.failing) throw new ORPCError("INTERNAL_SERVER_ERROR");
      const all = knownOrganizations();
      return {
        organizations: all.slice(offset, offset + limit).map((organizationId) => ({
          id: organizationId,
          name: organizationId,
          slug: `${organizationId}-slug`,
          status: "active",
          createdAt: new Date(0),
          memberCount: membersOf(organizationId).length,
          teamCount: 0,
        })),
        total: all.length,
      };
    },
    listOrganizations: async () =>
      (memberships.get(callerId(context)) ?? []).map((organization) => ({
        slug: organization.id,
        ...organization,
        status: "active",
        createdAt: new Date(),
      })),
    getActiveMemberRole: async ({ organizationId }: { organizationId: string }) => ({
      role: roles.get(`${organizationId}:${callerId(context)}`) ?? null,
    }),
    listUserTeams: async ({ organizationId }: { organizationId: string }) =>
      eventTeams.has(`${organizationId}:${callerId(context)}`)
        ? [{ id: "events", name: "Events", organizationId, areas: ["events"] }]
        : [],
    getOnboardingStats: async ({
      month,
      organizationId,
    }: {
      month: string;
      organizationId: string;
    }) => {
      if (!organizer(context, organizationId)) throw new ORPCError("FORBIDDEN");
      const totals = joins.get(`${organizationId}:${month}`) ?? { redeemed: 0, newMembers: 0 };
      return { month, totals, organizations: [] };
    },
    listOnboardingCodes: async ({ organizationId }: { organizationId: string }) =>
      (codes.get(organizationId) ?? []).map((code) => ({
        id: code.id,
        eventId: code.eventId,
        eventName: "Meetup",
        teamId: "events",
        role: "member",
        maxUses: 300,
        usedCount: code.joined.length,
        expiresAt: new Date(0),
        revokedAt: null,
        createdAt: new Date(0),
      })),
    getOnboardingStatus: async ({
      codeId,
      organizationId,
    }: {
      codeId: string;
      organizationId: string;
    }) => {
      const code = (codes.get(organizationId) ?? []).find((item) => item.id === codeId);
      if (!code) throw new ORPCError("NOT_FOUND");
      return {
        id: code.id,
        eventId: code.eventId,
        eventName: "Meetup",
        joined: code.joined.map(([userId, createdAt]) => ({
          userId,
          createdAt,
          userName: null,
          accountId: null,
        })),
      };
    },
  }),
  router: {},
};

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);
afterAll(teardown);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

function month(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

function dayOf(reportMonth: string, day: number, hour: number) {
  return new Date(`${reportMonth}-${String(day).padStart(2, "0")}T${hour}:00:00.000Z`);
}

function eventInput(ownerNodeId: string, startsAt: Date, status = "published") {
  return {
    ownerNodeId,
    nodeIds: [ownerNodeId],
    kind: "event" as const,
    title: "Builders Night",
    summary: "Meet the builders",
    url: `https://example.com/events/${crypto.randomUUID()}`,
    source: "Community",
    publishedAt: new Date(startsAt.getTime() - 7 * 86_400_000).toISOString(),
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
    timezone: "UTC",
    venue: "Town Hall",
    status: status as "published" | "cancelled",
  };
}

function withEventsTeam(userId: string, org: string) {
  const base = orgContext(userId, org, "member");
  eventTeams.add(`${org}:${userId}`);
  roles.set(`${org}:${userId}`, "member");
  return {
    ...base,
    organization: {
      ...(base.organization as Record<string, unknown>),
      teams: [{ id: `team-${userId}`, name: "Events", areas: ["events"] }],
      activeTeamId: null,
    },
  };
}

async function community(name = "Harbor City", startedAt = new Date("2026-10-01T12:00:00.000Z")) {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `monthly-${id}`;
  const resume = new Date();
  vi.setSystemTime(startedAt);
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `mr-${id}.near`));
  const tenant = await provisioner.createTenant({ name, accountId: `mr-${id}.near` });
  const node = await provisioner.createNode({
    name,
    slug: `monthly-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  vi.setSystemTime(resume);
  roles.set(`${org}:owner-${id}`, "owner");
  roles.set(`${org}:member-${id}`, "member");
  return {
    id,
    org,
    node,
    tenant,
    provisioner,
    owner: await getPluginClient(orgContext(`owner-${id}`, org)),
    organizer: await getPluginClient(withEventsTeam(`organizer-${id}`, org)),
    member: await getPluginClient(orgContext(`member-${id}`, org, "member")),
  };
}

const admin = () =>
  getPluginClient({
    userId: "platform-admin",
    user: { id: "platform-admin", email: "admin@example.com", name: "Admin", role: "admin" },
  });

describe("monthly reports", () => {
  it("lets owners and organizers write one report a month, platform admins only read it", async () => {
    const city = await community();
    const reported = month(-1);
    const outsider = await getPluginClient(orgContext(`outsider-${city.id}`, `other-${city.org}`));
    const platformAdmin = await admin();
    joins.set(`${city.org}:${reported}`, { redeemed: 7, newMembers: 3 });

    expect(
      await city.organizer.getMonthlyReport({ nodeId: city.node.id, month: reported }),
    ).toEqual({
      report: null,
      organizationId: city.org,
      canEdit: true,
      canReview: false,
      open: true,
      closesAt: `${month(1)}-01T00:00:00.000Z`,
      stats: { eventsHeld: 0, checkIns: 0, joins: 7, newMembers: 3 },
      checkInsSyncedAt: null,
    });

    const saved = await city.owner.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "  Two meetups and a hackathon.  ",
    });
    expect(saved).toMatchObject({
      nodeId: city.node.id,
      month: reported,
      notes: "Two meetups and a hackathon.",
      submittedBy: `owner-${city.id}`,
      submittedByName: "Test User",
      reviewedAt: null,
    });

    const edited = await city.organizer.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "Two meetups, a hackathon and a workshop.",
    });
    expect(edited.submittedAt).toBe(saved.submittedAt);
    expect(edited.submittedBy).toBe(`owner-${city.id}`);
    expect(edited.notes).toBe("Two meetups, a hackathon and a workshop.");
    expect(await city.owner.listMonthlyReportStatuses({ nodeId: city.node.id })).toEqual({
      firstMonth: "2026-11",
      statuses: [
        {
          month: reported,
          submittedAt: saved.submittedAt,
          updatedAt: edited.updatedAt,
          reviewedAt: null,
        },
      ],
    });

    expect(
      await platformAdmin.getMonthlyReport({ nodeId: city.node.id, month: reported }),
    ).toMatchObject({
      report: { notes: "Two meetups, a hackathon and a workshop." },
      canEdit: false,
      canReview: true,
      open: true,
    });
    expect(
      (await platformAdmin.listMonthlyReportStatuses({ nodeId: city.node.id })).statuses,
    ).toHaveLength(1);
    expect(
      (await platformAdmin.getMonthlyReport({ nodeId: city.node.id, month: reported }))
        .checkInsSyncedAt,
    ).toBeNull();
    await expect(
      platformAdmin.saveMonthlyReport({ nodeId: city.node.id, month: reported, notes: "Mine" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    for (const refused of [city.member, outsider]) {
      await expect(
        refused.getMonthlyReport({ nodeId: city.node.id, month: reported }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        refused.saveMonthlyReport({ nodeId: city.node.id, month: reported, notes: "Hi" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        refused.listMonthlyReportStatuses({ nodeId: city.node.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      (await getPluginClient()).getMonthlyReport({ nodeId: city.node.id, month: reported }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("stores the month's numbers with the report and keeps them once read-only", async () => {
    const city = await community();
    const reported = month(-1);
    const held = await city.owner.saveDiscoveryActivity(
      eventInput(city.node.id, dayOf(reported, 10, 10)),
    );
    await city.owner.saveDiscoveryActivity(eventInput(city.node.id, dayOf(reported, 12, 10)));
    await city.owner.saveDiscoveryActivity(
      eventInput(city.node.id, dayOf(reported, 14, 10), "cancelled"),
    );
    await city.owner.saveDiscoveryActivity(eventInput(city.node.id, dayOf(month(-2), 20, 10)));
    codes.set(city.org, [
      {
        id: `code-${city.id}`,
        eventId: held.id,
        joined: [
          ["attendee-a", dayOf(reported, 10, 11)],
          ["attendee-b", dayOf(reported, 10, 11)],
        ],
      },
    ]);
    expect(
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: reported })).stats,
    ).toMatchObject({ checkIns: 0 });
    await city.owner.reconcileAttendance({ organizationId: city.org });
    joins.set(`${city.org}:${reported}`, { redeemed: 5, newMembers: 2 });
    expect(
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: reported }))
        .checkInsSyncedAt,
    ).toBe(NOW);

    const saved = await city.organizer.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "Busy month.",
    });
    expect(saved.stats).toEqual({ eventsHeld: 2, checkIns: 2, joins: 5, newMembers: 2 });

    joins.set(`${city.org}:${reported}`, { redeemed: 9, newMembers: 4 });
    expect(
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: reported })).stats,
    ).toEqual({ eventsHeld: 2, checkIns: 2, joins: 9, newMembers: 4 });
    expect(
      (await (await admin()).getMonthlyReport({ nodeId: city.node.id, month: reported })).stats,
    ).toEqual({ eventsHeld: 2, checkIns: 2, joins: 5, newMembers: 2 });
  });

  it("is editable until the end of the following month and never for a month to come", async () => {
    vi.setSystemTime(new Date("2027-01-10T12:00:00.000Z"));
    const city = await community();
    const closed = month(-2);

    expect(
      await city.owner.saveMonthlyReport({
        nodeId: city.node.id,
        month: month(0),
        notes: "So far",
      }),
    ).toMatchObject({ month: month(0) });
    expect(
      await city.owner.getMonthlyReport({ nodeId: city.node.id, month: closed }),
    ).toMatchObject({ report: null, canEdit: true, open: false, stats: null });
    await expect(
      city.owner.saveMonthlyReport({ nodeId: city.node.id, month: closed, notes: "Late" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const call of [
      () => city.owner.getMonthlyReport({ nodeId: city.node.id, month: month(1) }),
      () => city.owner.saveMonthlyReport({ nodeId: city.node.id, month: month(1), notes: "Soon" }),
      () => city.owner.saveMonthlyReport({ nodeId: city.node.id, month: month(0), notes: "  " }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("starts with November 2026: earlier months are never owed or accepted", async () => {
    vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
    const city = await community();
    const platformAdmin = await admin();
    for (const call of [
      () => city.owner.getMonthlyReport({ nodeId: city.node.id, month: "2026-10" }),
      () => city.owner.saveMonthlyReport({ nodeId: city.node.id, month: "2026-10", notes: "Hi" }),
      () => platformAdmin.getMonthlyReport({ nodeId: city.node.id, month: "2026-10" }),
      () => platformAdmin.getAdminMonthlyReports({ month: "2026-10" }),
      () => platformAdmin.getAdminMonthlyReports({ month: "2026-12" }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(
      await city.owner.getMonthlyReport({ nodeId: city.node.id, month: "2026-11" }),
    ).toMatchObject({ report: null, canEdit: true, open: true });
    expect(
      (await platformAdmin.getAdminMonthlyReports({ month: "2026-11" })).communities.map(
        (row) => row.nodeId,
      ),
    ).toContain(city.node.id);
  });

  it("shows platform admins every community expected to report, and lets them mark reports reviewed", async () => {
    const veteran = await community("Alder Town");
    const quiet = await community("Birch Bay");
    const newcomer = await community("Cedar Point", new Date(NOW));
    const platformAdmin = await admin();
    const reported = "2026-11";

    const held = await veteran.owner.saveDiscoveryActivity(
      eventInput(veteran.node.id, dayOf(reported, 10, 10)),
    );
    await veteran.owner.saveDiscoveryActivity(eventInput(veteran.node.id, dayOf(reported, 20, 10)));
    await veteran.owner.saveEventReport({
      activityId: held.id,
      report: {
        format: "irl",
        socialLinks: ["https://example.com/post"],
        focus: "crypto",
        audiences: ["developers"],
        audienceOther: "",
        theme: "Build night",
        attendees: 20,
        slideLinks: [],
        kpis: ["20 attendees", "5 new members", ""],
        wentWell: "Energy",
        improvements: "Timing",
        talentAfter: "Office hours",
        talentDuring: "Mentors",
        materialsNeeded: "",
        hadPartners: false,
        partners: "",
        nextActions: "Next meetup",
        insights: "",
        mediaLinks: [],
      },
    });
    await veteran.owner.saveMonthlyReport({
      nodeId: veteran.node.id,
      month: reported,
      notes: "A good month.",
    });

    const rows = async (month: string) =>
      new Map(
        (await platformAdmin.getAdminMonthlyReports({ month })).communities.map((row) => [
          row.nodeId,
          row,
        ]),
      );
    const november = await rows(reported);
    expect(november.get(veteran.node.id)).toMatchObject({
      organizationId: veteran.org,
      slug: `${veteran.org}-slug`,
      name: "Alder Town",
      status: "submitted",
      report: {
        submittedByName: "Test User",
        reviewedAt: null,
        stats: { eventsHeld: 2, checkIns: 0, joins: 0, newMembers: 0 },
      },
      events: { ended: 2, reported: 1, toReview: 1 },
    });
    expect(november.get(quiet.node.id)).toMatchObject({
      status: "missing",
      report: null,
      slug: `${quiet.org}-slug`,
      events: { ended: 0, reported: 0, toReview: 0 },
    });
    expect(november.has(newcomer.node.id)).toBe(false);
    expect((await rows("2026-12")).get(newcomer.node.id)).toMatchObject({ status: "missing" });

    for (const refused of [veteran.owner, veteran.organizer]) {
      await expect(refused.getAdminMonthlyReports({ month: reported })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        refused.reviewMonthlyReport({
          nodeId: veteran.node.id,
          month: reported,
          reviewed: true,
          updatedAt: NOW,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      (await getPluginClient()).getAdminMonthlyReports({ month: reported }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      platformAdmin.reviewMonthlyReport({
        nodeId: quiet.node.id,
        month: reported,
        reviewed: true,
        updatedAt: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { reviewedAt } = await platformAdmin.reviewMonthlyReport({
      nodeId: veteran.node.id,
      month: reported,
      reviewed: true,
      updatedAt: NOW,
    });
    expect(reviewedAt).toBe(NOW);
    expect((await rows(reported)).get(veteran.node.id)).toMatchObject({
      status: "reviewed",
      report: { reviewedAt: NOW },
    });
    expect(
      (await veteran.owner.getMonthlyReport({ nodeId: veteran.node.id, month: reported })).report,
    ).toMatchObject({ reviewedAt: NOW });
    expect(
      (await veteran.owner.listMonthlyReportStatuses({ nodeId: veteran.node.id })).statuses,
    ).toEqual([expect.objectContaining({ month: reported, reviewedAt: NOW })]);

    expect(
      await platformAdmin.reviewMonthlyReport({
        nodeId: veteran.node.id,
        month: reported,
        reviewed: false,
        updatedAt: NOW,
      }),
    ).toEqual({ reviewedAt: null });
    expect((await rows(reported)).get(veteran.node.id)?.status).toBe("submitted");

    await platformAdmin.reviewMonthlyReport({
      nodeId: veteran.node.id,
      month: reported,
      reviewed: true,
      updatedAt: NOW,
    });
    const edited = await veteran.organizer.saveMonthlyReport({
      nodeId: veteran.node.id,
      month: reported,
      notes: "A good month, and a hackathon.",
    });
    expect(edited.reviewedAt).toBeNull();
    expect((await rows(reported)).get(veteran.node.id)?.status).toBe("submitted");
  });

  it("refuses to mark reviewed a report that was edited after the admin read it", async () => {
    const city = await community("Tidewater");
    const platformAdmin = await admin();
    const reported = month(-1);
    const target = { nodeId: city.node.id, month: reported, reviewed: true };
    const read = await city.owner.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "First version.",
    });

    vi.setSystemTime(new Date(Date.parse(NOW) + 5 * 60_000));
    const edited = await city.owner.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "Second version, which the admin has not read.",
    });
    expect(edited.updatedAt).not.toBe(read.updatedAt);

    await expect(
      platformAdmin.reviewMonthlyReport({ ...target, updatedAt: read.updatedAt }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: reported })).report
        ?.reviewedAt,
    ).toBeNull();

    expect(
      (await platformAdmin.reviewMonthlyReport({ ...target, updatedAt: edited.updatedAt }))
        .reviewedAt,
    ).not.toBeNull();
  });

  it("keeps one report per community, whichever of its nodes it is opened from", async () => {
    const city = await community("Harbor City");
    const platformAdmin = await admin();
    const reported = month(-1);
    await city.owner.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "Filed from the city node.",
    });

    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const first = await city.provisioner.createNode({
      name: "Aardvark Harbor",
      slug: `monthly-aardvark-${city.id}`,
      kind: "city",
      tenantId: city.tenant.id,
    });
    vi.setSystemTime(new Date(NOW));
    await city.provisioner.updateNode({ nodeId: city.node.id, name: "Zulu Harbor" });

    for (const nodeId of [first.id, city.node.id]) {
      expect(
        (await city.organizer.getMonthlyReport({ nodeId, month: reported })).report,
      ).toMatchObject({ nodeId, notes: "Filed from the city node." });
      expect((await city.owner.listMonthlyReportStatuses({ nodeId })).statuses).toEqual([
        expect.objectContaining({ month: reported }),
      ]);
    }
    const rows = (await platformAdmin.getAdminMonthlyReports({ month: reported })).communities;
    const mine = rows.filter((row) => row.organizationId === city.org);
    expect(mine).toEqual([expect.objectContaining({ status: "submitted", nodeId: first.id })]);

    await platformAdmin.reviewMonthlyReport({
      nodeId: first.id,
      month: reported,
      reviewed: true,
      updatedAt: mine[0]?.report?.updatedAt ?? "",
    });
    expect(
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: reported })).report
        ?.reviewedAt,
    ).toBe(NOW);
    const edited = await city.owner.saveMonthlyReport({
      nodeId: first.id,
      month: reported,
      notes: "Filed again from the new node.",
    });
    expect(edited).toMatchObject({ nodeId: first.id, reviewedAt: null });
    expect(
      (await platformAdmin.getAdminMonthlyReports({ month: reported })).communities.filter(
        (row) => row.organizationId === city.org,
      ),
    ).toHaveLength(1);
  });

  it("asks a community for reports only from the month it started", async () => {
    const city = await community("Larch Lake", new Date("2026-12-02T09:00:00.000Z"));
    const platformAdmin = await admin();

    expect(await city.owner.listMonthlyReportStatuses({ nodeId: city.node.id })).toEqual({
      firstMonth: "2026-12",
      statuses: [],
    });
    for (const call of [
      () => city.owner.getMonthlyReport({ nodeId: city.node.id, month: "2026-11" }),
      () => city.owner.saveMonthlyReport({ nodeId: city.node.id, month: "2026-11", notes: "Hi" }),
      () => platformAdmin.getMonthlyReport({ nodeId: city.node.id, month: "2026-11" }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(
      await city.owner.saveMonthlyReport({ nodeId: city.node.id, month: "2026-12", notes: "Hi" }),
    ).toMatchObject({ month: "2026-12" });
    const listed = async (month: string) =>
      (await platformAdmin.getAdminMonthlyReports({ month })).communities.some(
        (row) => row.organizationId === city.org,
      );
    expect(await listed("2026-11")).toBe(false);
    expect(await listed("2026-12")).toBe(true);
  });

  it("still lists every community, without copy links, when organizations can't be read", async () => {
    const city = await community("Maple Marsh");
    const platformAdmin = await admin();
    organizationLookups.failing = true;
    try {
      const rows = (await platformAdmin.getAdminMonthlyReports({ month: month(-1) })).communities;
      expect(rows.find((row) => row.organizationId === city.org)).toMatchObject({
        slug: null,
        status: "missing",
        name: "Maple Marsh",
      });
    } finally {
      organizationLookups.failing = false;
    }
    organizationLookups.calls = 0;
    const rows = (await platformAdmin.getAdminMonthlyReports({ month: month(-1) })).communities;
    expect(rows.find((row) => row.organizationId === city.org)?.slug).toBe(`${city.org}-slug`);
    expect(rows.length).toBeGreaterThan(1);
    expect(organizationLookups.calls).toBe(1);
  });

  it("lists the communities the caller reports for", async () => {
    const owned = await community("Harbor City");
    const organized = await community("Alder Town");
    const joined = await community("Birch Bay");
    const userId = `reporter-${owned.id}`;
    roles.set(`${owned.org}:${userId}`, "owner");
    roles.set(`${organized.org}:${userId}`, "member");
    eventTeams.add(`${organized.org}:${userId}`);
    roles.set(`${joined.org}:${userId}`, "member");
    memberships.set(userId, [
      { id: owned.org, name: "Harbor City" },
      { id: organized.org, name: "Alder Town" },
      { id: joined.org, name: "Birch Bay" },
      { id: userId, name: "Personal" },
    ]);
    const reporter = await getPluginClient(orgContext(userId, owned.org));

    expect(await reporter.listReportCommunities()).toEqual({
      communities: [
        {
          organizationId: organized.org,
          slug: organized.org,
          name: "Alder Town",
          nodeId: organized.node.id,
        },
        { organizationId: owned.org, slug: owned.org, name: "Harbor City", nodeId: owned.node.id },
      ],
      memberships: 3,
    });

    const newcomer = `newcomer-${owned.id}`;
    roles.set(`${joined.org}:${newcomer}`, "member");
    memberships.set(newcomer, [{ id: joined.org, name: "Birch Bay" }]);
    expect(
      await (await getPluginClient(orgContext(newcomer, joined.org))).listReportCommunities(),
    ).toEqual({ communities: [], memberships: 1 });
  });
});

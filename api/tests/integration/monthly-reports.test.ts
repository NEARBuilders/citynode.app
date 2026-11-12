import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

function organizer(context: unknown, organizationId: string) {
  const key = `${organizationId}:${callerId(context)}`;
  const role = roles.get(key);
  return role === "owner" || role === "admin" || eventTeams.has(key);
}

const authStub = {
  client: (context: unknown) => ({
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

async function community(name = "Harbor City") {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `monthly-${id}`;
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `mr-${id}.near`));
  const tenant = await provisioner.createTenant({ name, accountId: `mr-${id}.near` });
  const node = await provisioner.createNode({
    name,
    slug: `monthly-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  roles.set(`${org}:owner-${id}`, "owner");
  roles.set(`${org}:member-${id}`, "member");
  return {
    id,
    org,
    node,
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
      canEdit: true,
      open: true,
      closesAt: `${month(1)}-01T00:00:00.000Z`,
      stats: { eventsHeld: 0, checkIns: 0, joins: 7, newMembers: 3 },
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
    });

    const edited = await city.organizer.saveMonthlyReport({
      nodeId: city.node.id,
      month: reported,
      notes: "Two meetups, a hackathon and a workshop.",
    });
    expect(edited.submittedAt).toBe(saved.submittedAt);
    expect(edited.submittedBy).toBe(`owner-${city.id}`);
    expect(edited.notes).toBe("Two meetups, a hackathon and a workshop.");
    expect(await city.owner.listMonthlyReportStatuses({ nodeId: city.node.id })).toEqual([
      { month: reported, submittedAt: saved.submittedAt, updatedAt: edited.updatedAt },
    ]);

    expect(
      await platformAdmin.getMonthlyReport({ nodeId: city.node.id, month: reported }),
    ).toMatchObject({
      report: { notes: "Two meetups, a hackathon and a workshop." },
      canEdit: false,
      open: true,
    });
    expect(await platformAdmin.listMonthlyReportStatuses({ nodeId: city.node.id })).toHaveLength(1);
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
    await city.owner.reconcileAttendance({ organizationId: city.org });
    joins.set(`${city.org}:${reported}`, { redeemed: 5, newMembers: 2 });

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

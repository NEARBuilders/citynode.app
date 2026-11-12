import { Effect } from "effect";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        secrets: { ...original.default.config.secrets, LUMA_CALENDAR_API_KEYS: "fixture-key" },
      },
    },
  };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(teardown);

const HOUR = 3_600_000;

function memberWithTeam(
  userId: string,
  org: string,
  areas: string[],
  options: { active?: boolean; role?: string } = {},
) {
  const base = orgContext(userId, org, options.role ?? "member");
  const team = { id: `team-${userId}`, name: "Community", areas };
  return {
    ...base,
    organization: {
      ...(base.organization as Record<string, unknown>),
      teams: [team],
      activeTeamId: options.active ? team.id : null,
    },
  };
}

function eventInput(ownerNodeId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    ownerNodeId,
    nodeIds: [ownerNodeId],
    kind: "event" as const,
    title: "Builders Night",
    summary: "Meet the builders",
    url: `https://example.com/events/${crypto.randomUUID()}`,
    source: "Community",
    publishedAt: new Date(now).toISOString(),
    startsAt: new Date(now + 24 * HOUR).toISOString(),
    endsAt: new Date(now + 27 * HOUR).toISOString(),
    timezone: "UTC",
    venue: "Town Hall",
    status: "draft" as const,
    ...overrides,
  };
}

async function community() {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `event-reports-${id}`;
  const provisioner = await getPluginClient(daoContext(`owner-${id}`, org, `eo-${id}.near`));
  const tenant = await provisioner.createTenant({ name: "Organizers", accountId: `eo-${id}.near` });
  const node = await provisioner.createNode({
    name: "Organizer city",
    slug: `organizer-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return { id, org, node, owner: await getPluginClient(orgContext(`owner-${id}`, org)) };
}

const report = {
  format: "irl" as const,
  socialLinks: ["https://example.com/post"],
  focus: "crypto" as const,
  audiences: ["developers" as const],
  audienceOther: "",
  theme: "A hands-on build night",
  attendees: 42,
  slideLinks: [],
  kpis: ["40 attendees", "12 new members", ""] as [string, string, string],
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

describe("event reports", () => {
  it("lets organizers and owners submit and edit reports, and platform admins only read them", async () => {
    const { id, org, node, owner } = await community();
    const ended = await owner.saveDiscoveryActivity(
      eventInput(node.id, {
        status: "published",
        startsAt: new Date(Date.now() - 5 * HOUR).toISOString(),
        endsAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
    );
    const organizer = await getPluginClient(memberWithTeam(`organizer-${id}`, org, ["events"]));
    const member = await getPluginClient(orgContext(`member-${id}`, org, "member"));
    const outsider = await getPluginClient(orgContext(`outsider-${id}`, `other-${org}`, "owner"));
    const admin = await getPluginClient({
      userId: "platform-admin",
      user: { id: "platform-admin", email: "admin@example.com", name: "Admin", role: "admin" },
    });

    expect(await organizer.getEventReport({ activityId: ended.id })).toEqual({
      report: null,
      canEdit: true,
      canReview: false,
    });
    const saved = await organizer.saveEventReport({ activityId: ended.id, report });
    expect(saved).toMatchObject({
      activityId: ended.id,
      formVersion: 1,
      report: { attendees: 42 },
    });

    expect(await owner.getEventReport({ activityId: ended.id })).toMatchObject({
      report: { report: { theme: "A hands-on build night" } },
      canEdit: true,
    });
    expect(await admin.getEventReport({ activityId: ended.id })).toMatchObject({
      report: { report: { focus: "crypto" } },
      canEdit: false,
    });
    expect(await admin.listEventReportStatuses({ nodeId: node.id })).toHaveLength(1);
    expect(await organizer.listEventReportStatuses({ nodeId: node.id })).toEqual([
      { activityId: ended.id, submittedAt: saved.submittedAt },
    ]);

    const edited = await owner.saveEventReport({
      activityId: ended.id,
      report: { ...report, attendees: 45 },
    });
    expect(edited.report.attendees).toBe(45);
    expect(edited.submittedAt).toBe(saved.submittedAt);

    await expect(
      admin.saveEventReport({ activityId: ended.id, report: { ...report, attendees: 44 } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    for (const refused of [member, outsider]) {
      await expect(refused.getEventReport({ activityId: ended.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(refused.saveEventReport({ activityId: ended.id, report })).rejects.toMatchObject(
        { code: "FORBIDDEN" },
      );
      await expect(refused.listEventReportStatuses({ nodeId: node.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("lets platform admins mark a report reviewed, which the community sees and an edit clears", async () => {
    const { node, owner } = await community();
    const ended = await owner.saveDiscoveryActivity(
      eventInput(node.id, {
        status: "published",
        startsAt: new Date(Date.now() - 5 * HOUR).toISOString(),
        endsAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
    );
    const admin = await getPluginClient({
      userId: "platform-admin",
      user: { id: "platform-admin", email: "admin@example.com", name: "Admin", role: "admin" },
    });
    await expect(
      admin.reviewEventReport({ activityId: ended.id, reviewed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.saveEventReport({ activityId: ended.id, report });

    await expect(
      owner.reviewEventReport({ activityId: ended.id, reviewed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await getPluginClient()).reviewEventReport({ activityId: ended.id, reviewed: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(await admin.getEventReport({ activityId: ended.id })).toMatchObject({
      report: { reviewedAt: null },
      canEdit: false,
      canReview: true,
    });
    const { reviewedAt } = await admin.reviewEventReport({ activityId: ended.id, reviewed: true });
    expect(reviewedAt).not.toBeNull();
    expect((await owner.getEventReport({ activityId: ended.id })).report?.reviewedAt).toBe(
      reviewedAt,
    );
    const listed = (await admin.getAdminEvents()).events.find((event) => event.id === ended.id);
    expect(listed?.reportReviewedAt).toBe(reviewedAt);

    expect(await admin.reviewEventReport({ activityId: ended.id, reviewed: false })).toEqual({
      reviewedAt: null,
    });
    await admin.reviewEventReport({ activityId: ended.id, reviewed: true });
    const edited = await owner.saveEventReport({
      activityId: ended.id,
      report: { ...report, attendees: 50 },
    });
    expect(edited.reviewedAt).toBeNull();
  });

  it("only takes reports for events that have ended and weren't cancelled", async () => {
    const { node, owner } = await community();
    const upcoming = await owner.saveDiscoveryActivity(
      eventInput(node.id, { status: "published" }),
    );
    const cancelled = await owner.saveDiscoveryActivity(
      eventInput(node.id, {
        status: "cancelled",
        startsAt: new Date(Date.now() - 5 * HOUR).toISOString(),
        endsAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
    );
    for (const event of [upcoming, cancelled]) {
      await expect(owner.saveEventReport({ activityId: event.id, report })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("requires partners to be named and at least one social link", async () => {
    const { node, owner } = await community();
    const ended = await owner.saveDiscoveryActivity(
      eventInput(node.id, {
        status: "published",
        startsAt: new Date(Date.now() - 5 * HOUR).toISOString(),
        endsAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
    );
    await expect(
      owner.saveEventReport({ activityId: ended.id, report: { ...report, hadPartners: true } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.saveEventReport({ activityId: ended.id, report: { ...report, socialLinks: [] } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

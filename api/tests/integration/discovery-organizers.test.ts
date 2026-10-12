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
  options: { active?: boolean } = {},
) {
  const base = orgContext(userId, org, "member");
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
  const org = `discovery-organizers-${id}`;
  const provisioner = await getPluginClient(daoContext(`owner-${id}`, org, `do-${id}.near`));
  const tenant = await provisioner.createTenant({ name: "Organizers", accountId: `do-${id}.near` });
  const node = await provisioner.createNode({
    name: "Organizer city",
    slug: `organizer-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return { id, org, node, owner: await getPluginClient(orgContext(`owner-${id}`, org)) };
}

function stubLuma() {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://public-api.luma.com") return realFetch(input, init);
    return Response.json(
      url.pathname === "/v1/calendars/get"
        ? { id: "cal-organizers", name: "Organizers", url: "https://luma.com/organizers" }
        : {
            entries: [
              {
                id: `evt-${crypto.randomUUID()}`,
                platform: "luma",
                name: "Organizer meetup",
                url: `https://luma.com/${crypto.randomUUID()}`,
                start_at: "2027-01-01T12:00:00Z",
                end_at: "2027-01-01T14:00:00Z",
                created_at: "2026-09-01T12:00:00Z",
                timezone: "UTC",
                visibility: "public",
                location_visibility: "public",
                geo_address_json: { full_address: "Town Hall", city_state: null },
              },
            ],
            has_more: false,
          },
    );
  });
}

describe("events-area organizers", () => {
  it("lets an events-team member see drafts and manage events with their team active or not", async () => {
    const { id, org, node, owner } = await community();
    const draft = await owner.saveDiscoveryActivity(eventInput(node.id));

    for (const active of [false, true]) {
      const organizer = await getPluginClient(
        memberWithTeam(`organizer-${active}-${id}`, org, ["events"], { active }),
      );
      expect(await organizer.listDiscoveryActivities({ nodeId: node.id })).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: draft.id, status: "draft" })]),
      );
      await expect(
        organizer.saveDiscoveryActivity(
          eventInput(node.id, { title: `Organizer event ${active}` }),
        ),
      ).resolves.toMatchObject({ title: `Organizer event ${active}` });
      await expect(
        organizer.saveDiscoveryActivity({ ...eventInput(node.id), id: draft.id, title: "Edited" }),
      ).resolves.toMatchObject({ id: draft.id, title: "Edited" });
      await expect(organizer.getDiscoveryProfile({ nodeId: node.id })).resolves.toBeNull();
    }
  });

  it("lets an events-team member connect Luma, see hidden imports, approve them and disconnect", async () => {
    stubLuma();
    const { id, org, node } = await community();
    const organizer = await getPluginClient(memberWithTeam(`organizer-${id}`, org, ["events"]));

    await expect(organizer.listDiscoveryLumaCalendars({ nodeId: node.id })).resolves.toMatchObject({
      connection: null,
    });
    expect(
      await organizer.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-organizers" }),
    ).toMatchObject({ imported: 1 });
    const [imported] = await organizer.listDiscoveryActivities({ nodeId: node.id });
    expect(imported).toMatchObject({ status: "draft", luma: { hidden: true } });
    expect(
      await organizer.setDiscoveryLumaVisibility({
        nodeId: node.id,
        activityId: imported!.id,
        show: true,
      }),
    ).toMatchObject({ status: "published", luma: { hidden: false } });
    await expect(organizer.disconnectDiscoveryLuma({ nodeId: node.id })).resolves.toBeDefined();
  });

  it("keeps community settings and social updates with owners and admins", async () => {
    const { id, org, node, owner } = await community();
    const organizer = await getPluginClient(memberWithTeam(`organizer-${id}`, org, ["events"]));
    await expect(
      organizer.saveDiscoveryProfile({
        nodeId: node.id,
        summary: "Organizer edit",
        location: "",
        region: "",
        latitude: null,
        longitude: null,
        channels: [],
        published: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(organizer.getDiscoveryHistory({ nodeId: node.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const social = {
      ...eventInput(node.id),
      kind: "social" as const,
      title: "Weekly update",
      startsAt: null,
      endsAt: null,
      venue: "",
      status: "published" as const,
    };
    await expect(organizer.saveDiscoveryActivity(social)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(owner.saveDiscoveryActivity(social)).resolves.toMatchObject({ kind: "social" });
  });

  it("shows members without the events area only published events and refuses changes", async () => {
    stubLuma();
    const { id, org, node, owner } = await community();
    const draft = await owner.saveDiscoveryActivity(eventInput(node.id));
    const published = await owner.saveDiscoveryActivity(
      eventInput(node.id, { title: "Open night", status: "published" }),
    );
    await owner.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-organizers" });
    const members = [
      await getPluginClient(orgContext(`plain-${id}`, org, "member")),
      await getPluginClient(memberWithTeam(`treasury-${id}`, org, ["finance", "stake"])),
      await getPluginClient(
        memberWithTeam(`ops-${id}`, org, ["node-operations"], { active: true }),
      ),
    ];
    for (const member of members) {
      expect(
        (await member.listDiscoveryActivities({ nodeId: node.id })).map((event) => event.id),
      ).toEqual([published.id]);
      await expect(member.saveDiscoveryActivity(eventInput(node.id))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        member.saveDiscoveryActivity({ ...eventInput(node.id), id: draft.id, title: "Edited" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        member.importDiscoveryLuma({ nodeId: node.id, calendarId: "cal-organizers" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(member.disconnectDiscoveryLuma({ nodeId: node.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }

    const elsewhere = await getPluginClient(
      memberWithTeam(`elsewhere-${id}`, `other-${org}`, ["events"]),
    );
    await expect(elsewhere.listDiscoveryActivities({ nodeId: node.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(elsewhere.saveDiscoveryActivity(eventInput(node.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

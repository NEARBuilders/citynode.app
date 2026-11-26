import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateTestNode,
  authedContext,
  daoContext,
  getPluginClient,
  orgContext,
  teardown,
} from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const shardDog = vi.hoisted(() => ({
  awards: [] as Array<{ dropId: string; accountId: string; idempotencyKey: string }>,
  tried: [] as string[],
  failing: false,
  delayMs: 0,
}));

vi.mock("@/services/sharddog-client", () => ({
  createShardDogClient: () => ({
    mode: "stub",
    award: async (input: { dropId: string; accountId: string; idempotencyKey: string }) => {
      shardDog.tried.push(input.idempotencyKey);
      if (shardDog.delayMs) await new Promise((done) => setTimeout(done, shardDog.delayMs));
      if (shardDog.failing) throw new Error("ShardDog responded 503");
      shardDog.awards.push(input);
      return { viewUrl: `https://shard.dog/view/${input.dropId}/${input.accountId}` };
    },
    createClaimLink: async () => ({ claimUrl: "https://shard.dog/claim/x" }),
  }),
}));

type StubCode = {
  id: string;
  eventId: string;
  joined: Array<{ userId: string; createdAt: Date; accountId: string | null }>;
};

const codesByOrg = new Map<string, StubCode[]>();
const organizers = new Set<string>();

const callerId = (context: unknown) => (context as { userId?: string }).userId ?? "";

const codeOutput = (code: StubCode) => ({
  id: code.id,
  eventId: code.eventId,
  eventName: "Event",
  teamId: "event-team",
  role: "member",
  maxUses: 300,
  usedCount: code.joined.length,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
});

const authStub = {
  client: (context: unknown) => ({
    listOnboardingCodes: async (input: { organizationId?: string; eventId?: string }) => {
      const organizationId = input.organizationId ?? "";
      if (!organizers.has(`${organizationId}:${callerId(context)}`)) {
        throw new ORPCError("FORBIDDEN");
      }
      return (codesByOrg.get(organizationId) ?? [])
        .filter((code) => !input.eventId || code.eventId === input.eventId)
        .map(codeOutput);
    },
    getOnboardingStatus: async (input: { codeId: string; organizationId?: string }) => {
      const code = (codesByOrg.get(input.organizationId ?? "") ?? []).find(
        (item) => item.id === input.codeId,
      );
      if (!code) throw new ORPCError("NOT_FOUND");
      return {
        ...codeOutput(code),
        joined: code.joined.map((join) => ({ ...join, userName: null })),
      };
    },
  }),
  router: {},
};

const HOUR = 3_600_000;
const past = (hours: number) => new Date(Date.now() - hours * HOUR);

function eventInput(
  ownerNodeId: string,
  title: string,
  startsAt: Date,
  status: "published" | "draft" = "published",
) {
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
    status,
  };
}

async function community() {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `awards-${id}`;
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `aw-${id}.near`));
  const tenant = await provisioner.createTenant({
    name: "Awards city",
    accountId: `aw-${id}.near`,
  });
  const { node } = await activateTestNode({
    name: "Awards city",
    slug: `awards-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
    orgId: org,
  });
  const editor = await getPluginClient(orgContext(`editor-${id}`, org));
  const admin = await getPluginClient(authedContext("awards-platform-admin", "admin"));
  const organizerId = `organizer-${id}`;
  organizers.add(`${org}:${organizerId}`);
  codesByOrg.set(org, []);
  const organizer = await getPluginClient({
    ...authedContext(organizerId),
    reqHeaders: { cookie: `better-auth.session_token=${organizerId}` },
  });
  return {
    org,
    addEvent: async (
      title: string,
      dropId: string | null,
      status: "published" | "draft" = "published",
    ) => {
      const event = await editor.saveDiscoveryActivity(
        eventInput(node.id, title, past(24), status),
      );
      if (dropId) await admin.setShardDogDrop({ organizationId: org, eventId: event.id, dropId });
      return event;
    },
    setMembershipDrop: (dropId: string) => admin.setShardDogDrop({ organizationId: org, dropId }),
    setEventDrop: (eventId: string, dropId: string | null) =>
      admin.setShardDogDrop({ organizationId: org, eventId, dropId }),
    checkIn: (eventId: string, userId: string, accountId: string | null) => {
      codesByOrg.get(org)?.push({
        id: `code-${crypto.randomUUID().slice(0, 8)}`,
        eventId,
        joined: [{ userId, createdAt: new Date(), accountId }],
      });
    },
    sync: () => organizer.reconcileAttendance({ organizationId: org }),
  };
}

const attendee = (userId: string) => getPluginClient(authedContext(userId));

const settle = () => new Promise((done) => setTimeout(done, 300));

const statuses = async (userId: string, organizationId: string) =>
  (await (await attendee(userId)).getMyCollectibles({ organizationId })).collectibles.map(
    ({ status }) => status,
  );

const untilStatuses = (userId: string, organizationId: string, expected: string[]) =>
  vi.waitFor(async () => expect(await statuses(userId, organizationId)).toEqual(expected), {
    timeout: 5_000,
  });

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  shardDog.awards.length = 0;
  shardDog.tried.length = 0;
  shardDog.failing = false;
  shardDog.delayMs = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShardDog awards on event check-in", () => {
  it("awards the membership and event badges on the first check-in, then only event badges", async () => {
    const city = await community();
    await city.setMembershipDrop("city-member");
    const first = await city.addEvent("Builders night", "night-drop");
    const second = await city.addEvent("Hack day", "hack-drop");
    const userId = `ada-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(first.id, userId, "ada.testnet");
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded", "awarded"]);
    expect(shardDog.awards.map(({ dropId, accountId }) => [dropId, accountId]).sort()).toEqual([
      ["city-member", "ada.testnet"],
      ["night-drop", "ada.testnet"],
    ]);
    const afterFirst = await (await attendee(userId)).getMyCollectibles({
      organizationId: city.org,
    });
    expect(afterFirst.enabled).toBe(true);
    expect(afterFirst.collectibles).toEqual(
      expect.arrayContaining([
        {
          organizationId: city.org,
          kind: "membership",
          eventId: null,
          status: "awarded",
          viewUrl: "https://shard.dog/view/city-member/ada.testnet",
        },
        {
          organizationId: city.org,
          kind: "event",
          eventId: first.id,
          status: "awarded",
          viewUrl: "https://shard.dog/view/night-drop/ada.testnet",
        },
      ]),
    );

    shardDog.awards.length = 0;
    city.checkIn(second.id, userId, "ada.testnet");
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded", "awarded", "awarded"]);
    expect(shardDog.awards.map(({ dropId }) => dropId)).toEqual(["hack-drop"]);
  });

  it("never awards a badge twice on repeat check-ins or repeat syncs", async () => {
    const city = await community();
    await city.setMembershipDrop("repeat-member");
    const event = await city.addEvent("Meetup", "meetup-drop");
    const userId = `grace-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, "grace.testnet");
    await city.sync();
    city.checkIn(event.id, userId, "grace.testnet");
    await city.sync();
    await city.sync();
    await (await attendee(userId)).getMyCollectibles({});
    await untilStatuses(userId, city.org, ["awarded", "awarded"]);
    await settle();

    expect(shardDog.awards.map(({ dropId }) => dropId).sort()).toEqual([
      "meetup-drop",
      "repeat-member",
    ]);
    expect(new Set(shardDog.awards.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(2);
  });

  it("keeps check-in working while ShardDog is down and retries the pending awards", async () => {
    const city = await community();
    await city.setMembershipDrop("retry-member");
    const event = await city.addEvent("Workshop", "workshop-drop");
    const userId = `linus-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, "linus.testnet");
    expect(await city.sync()).toMatchObject({ failed: [] });
    await vi.waitFor(() => expect(shardDog.tried).toHaveLength(2));
    await settle();
    const client = await attendee(userId);
    expect(
      (await client.getMyCollectibles({ organizationId: city.org })).collectibles.map(
        ({ status, viewUrl }) => [status, viewUrl],
      ),
    ).toEqual([
      ["pending", null],
      ["pending", null],
    ]);

    shardDog.failing = false;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 5 * 60_000 });
    await Promise.all([
      client.getMyCollectibles({ organizationId: city.org }),
      client.getMyCollectibles({ organizationId: city.org }),
      city.sync(),
    ]);
    await untilStatuses(userId, city.org, ["awarded", "awarded"]);
    await settle();
    expect(shardDog.awards).toHaveLength(2);
  });

  it("waits between retries instead of calling ShardDog on every read", async () => {
    const city = await community();
    const event = await city.addEvent("Talk", "talk-drop");
    const userId = `alan-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, "alan.testnet");
    await city.sync();
    await vi.waitFor(() => expect(shardDog.tried).toHaveLength(1));
    await settle();
    shardDog.failing = false;
    expect(await statuses(userId, city.org)).toEqual(["pending"]);
    await settle();
    expect(await statuses(userId, city.org)).toEqual(["pending"]);
    expect(shardDog.awards).toHaveLength(0);
  });

  it("sends a row once while a slow award is still in flight", async () => {
    const city = await community();
    const event = await city.addEvent("Slow night", "slow-drop");
    const userId = `slow-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.delayMs = 500;
    city.checkIn(event.id, userId, "slow.testnet");
    const firstSync = city.sync();
    await vi.waitFor(() => expect(shardDog.tried).toHaveLength(1));
    const client = await attendee(userId);
    await Promise.all([
      client.getMyCollectibles({ organizationId: city.org }),
      client.getMyCollectibles({}),
      firstSync,
    ]);
    await untilStatuses(userId, city.org, ["awarded"]);
    await settle();
    expect(shardDog.tried).toHaveLength(1);
  });

  it("returns from sync without waiting for ShardDog", async () => {
    const city = await community();
    const event = await city.addEvent("Busy night", "busy-drop");
    const userId = `busy-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.delayMs = 3_000;
    city.checkIn(event.id, userId, "busy.testnet");
    const started = Date.now();
    await city.sync();
    expect(await statuses(userId, city.org)).toEqual(["pending"]);
    expect(Date.now() - started).toBeLessThan(2_000);
    await untilStatuses(userId, city.org, ["awarded"]);
  });

  it("keeps an attempted award through unlink and re-link so it reuses its key", async () => {
    const city = await community();
    const event = await city.addEvent("Relink", "relink-drop");
    const userId = `relink-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, "relink.testnet");
    await city.sync();
    await vi.waitFor(() => expect(shardDog.tried).toHaveLength(1));
    await settle();
    const [firstKey] = shardDog.tried;

    await city.setEventDrop(event.id, null);
    await city.sync();
    shardDog.failing = false;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 5 * 60_000 });
    expect(await statuses(userId, city.org)).toEqual([]);
    await settle();
    expect(shardDog.tried).toHaveLength(1);

    await city.setEventDrop(event.id, "relink-drop");
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded"]);
    expect(shardDog.awards.map(({ idempotencyKey }) => idempotencyKey)).toEqual([firstKey]);
  });

  it("drops an unattempted award when its drop is unlinked", async () => {
    const city = await community();
    const event = await city.addEvent("Unlink", "unlink-drop");
    const userId = `unlink-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, null);
    await city.sync();
    expect(await statuses(userId, city.org)).toEqual(["needs_account"]);

    await city.setEventDrop(event.id, null);
    await city.sync();
    expect(await statuses(userId, city.org)).toEqual([]);
  });

  it("holds the badges for someone checked in without a NEAR account", async () => {
    const city = await community();
    await city.setMembershipDrop("no-account-member");
    const event = await city.addEvent("Open house", "open-drop");
    const userId = `noacct-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, null);
    await city.sync();
    await settle();

    expect(shardDog.awards).toHaveLength(0);
    expect(
      (
        await (await attendee(userId)).getMyCollectibles({ organizationId: city.org })
      ).collectibles.map(({ status }) => status),
    ).toEqual(["needs_account", "needs_account"]);
  });

  it("awards nothing for events or communities without a linked drop", async () => {
    const city = await community();
    const event = await city.addEvent("Unlinked", null);
    const userId = `plain-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, "plain.testnet");
    await city.sync();
    await settle();

    expect(shardDog.awards).toHaveLength(0);
    expect(
      (await (await attendee(userId)).getMyCollectibles({ organizationId: city.org })).collectibles,
    ).toEqual([]);
  });
});

describe("A NEAR account's City Node collectibles on its profile", () => {
  const visitor = () => getPluginClient();

  it("lists awarded badges newest first for anyone, with their View in ShardDog links", async () => {
    const city = await community();
    await city.setMembershipDrop("profile-member");
    const first = await city.addEvent("Builders night", "profile-night");
    const second = await city.addEvent("Hack day", "profile-hack");
    const userId = `lin-${crypto.randomUUID().slice(0, 6)}`;
    const accountId = `lin-${crypto.randomUUID().slice(0, 6)}.testnet`;

    city.checkIn(first.id, userId, accountId);
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded", "awarded"]);
    await new Promise((done) => setTimeout(done, 20));
    city.checkIn(second.id, userId, accountId);
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded", "awarded", "awarded"]);

    const result = await (await visitor()).getAccountCollectibles({ accountId });
    expect(result.enabled).toBe(true);
    expect(result.collectibles[0]).toMatchObject({
      organizationId: city.org,
      communityName: "Awards city",
      kind: "event",
      eventId: second.id,
      eventTitle: "Hack day",
      viewUrl: `https://shard.dog/view/profile-hack/${accountId}`,
    });
    expect(
      result.collectibles
        .map(({ kind, eventTitle }) => [kind, eventTitle])
        .slice(1)
        .sort(),
    ).toEqual([
      ["event", "Builders night"],
      ["membership", null],
    ]);
    const times = result.collectibles.map(({ awardedAt }) => Date.parse(awardedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("shows nothing for an account with no awarded badges", async () => {
    const result = await (await visitor()).getAccountCollectibles({
      accountId: `nobody-${crypto.randomUUID().slice(0, 6)}.testnet`,
    });
    expect(result).toEqual({ enabled: true, collectibles: [] });
  });

  it("leaves out pending awards", async () => {
    const city = await community();
    await city.setMembershipDrop("profile-pending");
    const event = await city.addEvent("Workshop", "profile-pending-event");
    const userId = `kay-${crypto.randomUUID().slice(0, 6)}`;
    const accountId = `kay-${crypto.randomUUID().slice(0, 6)}.testnet`;
    shardDog.failing = true;

    city.checkIn(event.id, userId, accountId);
    await city.sync();
    await settle();

    expect(await statuses(userId, city.org)).toEqual(["pending", "pending"]);
    expect((await (await visitor()).getAccountCollectibles({ accountId })).collectibles).toEqual(
      [],
    );
  });

  it("hides event badges from events that aren't published", async () => {
    const city = await community();
    const draft = await city.addEvent("Private dinner", "profile-draft", "draft");
    const userId = `ray-${crypto.randomUUID().slice(0, 6)}`;
    const accountId = `ray-${crypto.randomUUID().slice(0, 6)}.testnet`;

    city.checkIn(draft.id, userId, accountId);
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded"]);

    expect((await (await visitor()).getAccountCollectibles({ accountId })).collectibles).toEqual(
      [],
    );
  });
});

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AWARD_ATTEMPTS } from "@/services/sharddog";
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
  claimsTried: [] as string[],
  claims: [] as Array<{ dropId: string; idempotencyKey: string }>,
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
    createClaimLink: async (input: { dropId: string; idempotencyKey: string }) => {
      shardDog.claimsTried.push(input.idempotencyKey);
      if (shardDog.failing) throw new Error("ShardDog responded 503");
      shardDog.claims.push(input);
      return { claimUrl: `https://shard.dog/claim/${input.idempotencyKey}` };
    },
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
    addEvent: async (title: string, dropId: string | null) => {
      const event = await editor.saveDiscoveryActivity(eventInput(node.id, title, past(24)));
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
  shardDog.claimsTried.length = 0;
  shardDog.claims.length = 0;
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
          claimUrl: null,
        },
        {
          organizationId: city.org,
          kind: "event",
          eventId: first.id,
          status: "awarded",
          viewUrl: "https://shard.dog/view/night-drop/ada.testnet",
          claimUrl: null,
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

  it("gives someone checked in without a NEAR account a one-time claim link per badge", async () => {
    const city = await community();
    await city.setMembershipDrop("no-account-member");
    const event = await city.addEvent("Open house", "open-drop");
    const userId = `noacct-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, null);
    await city.sync();
    await vi.waitFor(() => expect(shardDog.claims).toHaveLength(2));
    await settle();

    expect(shardDog.awards).toHaveLength(0);
    expect(shardDog.claims.map(({ dropId }) => dropId).sort()).toEqual([
      "no-account-member",
      "open-drop",
    ]);
    const read = await (await attendee(userId)).getMyCollectibles({ organizationId: city.org });
    expect(read.collectibles).toEqual(
      expect.arrayContaining(
        shardDog.claims.map(({ idempotencyKey }) =>
          expect.objectContaining({
            status: "claim",
            viewUrl: null,
            claimUrl: `https://shard.dog/claim/${idempotencyKey}`,
          }),
        ),
      ),
    );
    expect(new Set(shardDog.claims.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(2);
  });

  it("keeps the badge waiting when ShardDog can't make a claim link, then retries", async () => {
    const city = await community();
    const event = await city.addEvent("Pop-up", "popup-drop");
    const userId = `noclaim-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, null);
    await city.sync();
    await settle();
    const client = await attendee(userId);
    expect(
      (await client.getMyCollectibles({ organizationId: city.org })).collectibles.map(
        ({ status, claimUrl }) => [status, claimUrl],
      ),
    ).toEqual([["pending", null]]);

    shardDog.failing = false;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 5 * 60_000 });
    await untilStatuses(userId, city.org, ["claim"]);
    expect(shardDog.claims).toHaveLength(1);
  });

  it("shows needs_account only once ShardDog has failed every claim link attempt", async () => {
    const city = await community();
    const event = await city.addEvent("Rainy day", "rainy-drop");
    const userId = `giveup-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, null);
    await city.sync();
    await settle();
    const client = await attendee(userId);
    let now = Date.now();
    for (let attempt = 1; attempt < MAX_AWARD_ATTEMPTS; attempt += 1) {
      now += 60 * 60_000;
      vi.useFakeTimers({ toFake: ["Date"], now });
      expect(
        (await client.getMyCollectibles({ organizationId: city.org })).collectibles.map(
          ({ status }) => status,
        ),
      ).toEqual(["pending"]);
      await settle();
    }
    await untilStatuses(userId, city.org, ["needs_account"]);
  }, 30_000);

  it("awards a badge that gave up on a claim link once a NEAR account shows up", async () => {
    const city = await community();
    const first = await city.addEvent("Storm night", "storm-drop");
    const second = await city.addEvent("Clear night", "clear-drop");
    const userId = `revive-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(first.id, userId, null);
    await city.sync();
    await settle();
    const client = await attendee(userId);
    let now = Date.now();
    for (let attempt = 1; attempt < MAX_AWARD_ATTEMPTS; attempt += 1) {
      now += 60 * 60_000;
      vi.useFakeTimers({ toFake: ["Date"], now });
      await client.getMyCollectibles({ organizationId: city.org });
      await settle();
    }
    await untilStatuses(userId, city.org, ["needs_account"]);

    shardDog.failing = false;
    vi.useFakeTimers({ toFake: ["Date"], now: now + 60_000 });
    city.checkIn(second.id, userId, "revive.testnet");
    await city.sync();
    await untilStatuses(userId, city.org, ["awarded", "awarded"]);
    expect(shardDog.awards.map(({ dropId }) => dropId).sort()).toEqual([
      "clear-drop",
      "storm-drop",
    ]);
    expect(shardDog.claims).toHaveLength(0);
    expect(shardDog.claimsTried.length).toBeGreaterThan(0);
    expect(shardDog.tried.filter((key) => shardDog.claimsTried.includes(key))).toEqual([]);
  }, 30_000);

  it("keeps the claim link once handed out, even when a NEAR account shows up later", async () => {
    const city = await community();
    const first = await city.addEvent("First meetup", "first-drop");
    const second = await city.addEvent("Second meetup", "second-drop");
    const userId = `later-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(first.id, userId, null);
    await city.sync();
    await vi.waitFor(() =>
      expect(shardDog.claims.map(({ dropId }) => dropId)).toEqual(["first-drop"]),
    );
    await settle();

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 5 * 60_000 });
    city.checkIn(second.id, userId, "later.testnet");
    await city.sync();
    await vi.waitFor(() => expect(shardDog.awards).toHaveLength(1));
    await settle();

    expect(shardDog.awards.map(({ dropId, accountId }) => [dropId, accountId])).toEqual([
      ["second-drop", "later.testnet"],
    ]);
    expect(shardDog.claims).toHaveLength(1);
    const read = await (await attendee(userId)).getMyCollectibles({ organizationId: city.org });
    const states = new Map(
      read.collectibles.map(({ eventId, status, claimUrl }) => [eventId, [status, !!claimUrl]]),
    );
    expect(states.get(first.id)).toEqual(["claim", true]);
    expect(states.get(second.id)).toEqual(["awarded", false]);
  });

  it("never hands out a second claim link when a drop is unlinked and linked to a new one", async () => {
    const city = await community();
    const event = await city.addEvent("Relinked", "relink-drop");
    const userId = `relink-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, null);
    await city.sync();
    await vi.waitFor(() => expect(shardDog.claims).toHaveLength(1));
    await settle();
    await city.setEventDrop(event.id, null);
    await city.sync();
    await city.setEventDrop(event.id, "relink-drop-2");
    await city.sync();
    await settle();

    expect(shardDog.claims.map(({ dropId }) => dropId)).toEqual(["relink-drop"]);
    const read = await (await attendee(userId)).getMyCollectibles({ organizationId: city.org });
    expect(read.collectibles.map(({ status }) => status)).toEqual(["claim"]);
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

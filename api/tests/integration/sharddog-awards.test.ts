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
  failing: false,
}));

vi.mock("@/services/sharddog-client", () => ({
  createShardDogClient: () => ({
    mode: "stub",
    award: async (input: { dropId: string; accountId: string; idempotencyKey: string }) => {
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

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  shardDog.awards.length = 0;
  shardDog.failing = false;
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
    expect(shardDog.awards.map(({ dropId }) => dropId)).toEqual(["hack-drop"]);
    expect(
      (await (await attendee(userId)).getMyCollectibles({ organizationId: city.org })).collectibles,
    ).toHaveLength(3);
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
    const [retried] = await Promise.all([
      client.getMyCollectibles({ organizationId: city.org }),
      client.getMyCollectibles({ organizationId: city.org }),
      city.sync(),
    ]);
    expect(retried.collectibles.map(({ status }) => status)).toEqual(["awarded", "awarded"]);
    expect(shardDog.awards).toHaveLength(2);
  });

  it("waits between retries instead of calling ShardDog on every read", async () => {
    const city = await community();
    const event = await city.addEvent("Talk", "talk-drop");
    const userId = `alan-${crypto.randomUUID().slice(0, 6)}`;

    shardDog.failing = true;
    city.checkIn(event.id, userId, "alan.testnet");
    await city.sync();
    shardDog.failing = false;
    const read = await (await attendee(userId)).getMyCollectibles({ organizationId: city.org });
    expect(read.collectibles.map(({ status }) => status)).toEqual(["pending"]);
    expect(shardDog.awards).toHaveLength(0);
  });

  it("holds the badges for someone checked in without a NEAR account", async () => {
    const city = await community();
    await city.setMembershipDrop("no-account-member");
    const event = await city.addEvent("Open house", "open-drop");
    const userId = `noacct-${crypto.randomUUID().slice(0, 6)}`;

    city.checkIn(event.id, userId, null);
    await city.sync();

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

    expect(shardDog.awards).toHaveLength(0);
    expect(
      (await (await attendee(userId)).getMyCollectibles({ organizationId: city.org })).collectibles,
    ).toEqual([]);
  });
});

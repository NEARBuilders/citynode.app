import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        variables: { ...original.default.config.variables, sharddogEnabled: true },
      },
    },
  };
});
const describeCalls = vi.hoisted(() => new Map<string, number>());

vi.mock("@/services/sharddog-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/sharddog-client")>();
  return {
    ...original,
    createShardDogClient: () => ({
      ...original.createStubShardDogClient("https://shard.dog"),
      describeDrop: async (dropId: string) => {
        describeCalls.set(dropId, (describeCalls.get(dropId) ?? 0) + 1);
        if (dropId.startsWith("broken")) throw new Error("ShardDog responded 503");
        if (dropId.startsWith("named"))
          return { name: "Builders pup", imageUrl: "https://cdn.shard.dog/pup.png" };
        return null;
      },
    }),
  };
});

const roles = new Map<string, string>();

const authStub = {
  client: (context: unknown) => {
    const userId = (context as { userId?: string }).userId ?? "";
    return {
      getActiveMemberRole: async ({ organizationId }: { organizationId: string }) => {
        const role = roles.get(`${organizationId}:${userId}`);
        if (!role) throw new ORPCError("FORBIDDEN", { message: "Not a member" });
        return { role };
      },
    };
  },
  router: {},
};

const HOUR = 3_600_000;

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
  const org = `collectibles-${id}`;
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `cl-${id}.near`));
  const tenant = await provisioner.createTenant({ name: "Pup city", accountId: `cl-${id}.near` });
  const { node } = await activateTestNode({
    name: "Pup city",
    slug: `pup-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
    orgId: org,
  });
  const editor = await getPluginClient(orgContext(`editor-${id}`, org));
  const later = await editor.saveDiscoveryActivity({
    ...eventInput(node.id, "Demo day", new Date(Date.now() + 72 * HOUR)),
    publishedAt: new Date(Date.now() - HOUR).toISOString(),
  });
  const sooner = await editor.saveDiscoveryActivity(
    eventInput(node.id, "Builders night", new Date(Date.now() + 24 * HOUR)),
  );
  const adminId = `admin-${id}`;
  roles.set(`${org}:${adminId}`, "admin");
  const admin = await getPluginClient(authedContext(adminId));
  return { org, nodeId: node.id, editor, later, sooner, admin };
}

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

describe("Community collectibles", () => {
  it("is empty when no drops are linked", async () => {
    const { nodeId } = await community();
    expect(await (await getPluginClient()).getNodeCollectibles({ nodeId })).toEqual({
      collectibles: [],
    });
  });

  it("lists the membership drop first, then each event with a drop, newest first", async () => {
    const { org, nodeId, later, sooner, admin } = await community();
    await admin.setShardDogDrop({ organizationId: org, dropId: "pup-member" });
    await admin.setShardDogDrop({ organizationId: org, eventId: sooner.id, dropId: "named-1" });
    await admin.setShardDogDrop({ organizationId: org, eventId: later.id, dropId: "demo-day" });

    expect(await (await getPluginClient()).getNodeCollectibles({ nodeId })).toEqual({
      collectibles: [
        {
          kind: "membership",
          dropId: "pup-member",
          eventId: null,
          eventTitle: null,
          eventStartsAt: null,
          name: null,
          imageUrl: null,
          viewUrl: "https://shard.dog/stub/drops/pup-member",
        },
        {
          kind: "event",
          dropId: "demo-day",
          eventId: later.id,
          eventTitle: "Demo day",
          eventStartsAt: later.startsAt,
          name: null,
          imageUrl: null,
          viewUrl: "https://shard.dog/stub/drops/demo-day",
        },
        {
          kind: "event",
          dropId: "named-1",
          eventId: sooner.id,
          eventTitle: "Builders night",
          eventStartsAt: sooner.startsAt,
          name: "Builders pup",
          imageUrl: "https://cdn.shard.dog/pup.png",
          viewUrl: "https://shard.dog/stub/drops/named-1",
        },
      ],
    });
  });

  it("leaves out events without a drop and events visitors can't see", async () => {
    const { org, nodeId, editor, sooner, admin } = await community();
    const draft = await editor.saveDiscoveryActivity({
      ...eventInput(nodeId, "Secret launch", new Date(Date.now() + 48 * HOUR)),
      status: "draft",
    });
    await admin.setShardDogDrop({ organizationId: org, eventId: draft.id, dropId: "secret" });
    await admin.setShardDogDrop({ organizationId: org, eventId: sooner.id, dropId: "night" });

    const { collectibles } = await (await getPluginClient()).getNodeCollectibles({ nodeId });
    expect(collectibles.map((item) => item.dropId)).toEqual(["night"]);
  });

  it("still lists a drop with its link when ShardDog can't describe it", async () => {
    const { org, nodeId, admin } = await community();
    await admin.setShardDogDrop({ organizationId: org, dropId: "broken-member" });

    expect(await (await getPluginClient()).getNodeCollectibles({ nodeId })).toMatchObject({
      collectibles: [
        {
          kind: "membership",
          name: null,
          imageUrl: null,
          viewUrl: "https://shard.dog/stub/drops/broken-member",
        },
      ],
    });
  });

  it("is empty for an unknown node or a node without a live community", async () => {
    const client = await getPluginClient();
    expect(await client.getNodeCollectibles({ nodeId: crypto.randomUUID() })).toEqual({
      collectibles: [],
    });
    await expect(client.getNodeCollectibles({ nodeId: "not-a-node" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const { node } = await activateTestNode({
      name: "No tenant",
      slug: `no-tenant-${crypto.randomUUID().slice(0, 8)}`,
      kind: "city",
    });
    expect(await client.getNodeCollectibles({ nodeId: node.id })).toEqual({ collectibles: [] });
  });

  it("asks ShardDog about each drop once, not on every page view", async () => {
    const { org, nodeId, admin } = await community();
    const visitor = await getPluginClient();
    await admin.setShardDogDrop({ organizationId: org, dropId: "broken-cached" });
    for (let view = 0; view < 3; view++) await visitor.getNodeCollectibles({ nodeId });
    expect(describeCalls.get("broken-cached")).toBe(1);
  });

  it("shows at most the 12 newest event badges", async () => {
    const { org, nodeId, editor, admin } = await community();
    for (let day = 1; day <= 13; day++) {
      const event = await editor.saveDiscoveryActivity({
        ...eventInput(nodeId, `Meetup ${day}`, new Date(Date.now() + day * 24 * HOUR)),
        publishedAt: new Date(Date.now() - HOUR).toISOString(),
      });
      await admin.setShardDogDrop({ organizationId: org, eventId: event.id, dropId: `day-${day}` });
    }

    const { collectibles } = await (await getPluginClient()).getNodeCollectibles({ nodeId });
    expect(collectibles).toHaveLength(12);
    expect(collectibles[0]?.dropId).toBe("day-13");
    expect(collectibles.map((item) => item.dropId)).not.toContain("day-1");
  });
});

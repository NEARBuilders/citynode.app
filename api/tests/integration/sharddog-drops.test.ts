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
  const org = `sharddog-${id}`;
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `sd-${id}.near`));
  const tenant = await provisioner.createTenant({ name: "Drops city", accountId: `sd-${id}.near` });
  const { node } = await activateTestNode({
    name: "Drops city",
    slug: `drops-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
    orgId: org,
  });
  const editor = await getPluginClient(orgContext(`editor-${id}`, org));
  const event = await editor.saveDiscoveryActivity(
    eventInput(node.id, "Builders night", new Date(Date.now() + 24 * HOUR)),
  );
  const as = (role: string | null) => {
    const userId = `${role ?? "outsider"}-${id}`;
    if (role) roles.set(`${org}:${userId}`, role);
    return getPluginClient(authedContext(userId));
  };
  return { org, event, editor, nodeId: node.id, as };
}

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

describe("ShardDog drops", () => {
  it("lets a community admin set and clear the membership drop and an event drop", async () => {
    const { org, event, as } = await community();
    const admin = await as("admin");

    expect(await admin.getShardDogDrops({ organizationId: org })).toEqual({
      enabled: true,
      canEdit: true,
      membershipDropId: null,
      events: [
        { eventId: event.id, title: "Builders night", startsAt: event.startsAt, dropId: null },
      ],
    });

    await admin.setShardDogDrop({ organizationId: org, dropId: "drops-city-member" });
    const linked = await admin.setShardDogDrop({
      organizationId: org,
      eventId: event.id,
      dropId: " builders-night ",
    });
    expect(linked).toMatchObject({
      membershipDropId: "drops-city-member",
      events: [{ eventId: event.id, dropId: "builders-night" }],
    });

    await admin.setShardDogDrop({ organizationId: org, dropId: null });
    const cleared = await admin.setShardDogDrop({
      organizationId: org,
      eventId: event.id,
      dropId: null,
    });
    expect(cleared).toMatchObject({
      membershipDropId: null,
      events: [{ eventId: event.id, dropId: null }],
    });
  });

  it("lets owners and platform admins set drops", async () => {
    const { org, event, as } = await community();
    await (await as("owner")).setShardDogDrop({ organizationId: org, dropId: "owner-drop" });
    const platform = await getPluginClient(authedContext("sharddog-platform-admin", "admin"));
    const read = await platform.setShardDogDrop({
      organizationId: org,
      eventId: event.id,
      dropId: "platform-drop",
    });
    expect(read).toMatchObject({
      canEdit: true,
      membershipDropId: "owner-drop",
      events: [{ dropId: "platform-drop" }],
    });
  });

  it("keeps members, outsiders and visitors from setting drops, while anyone can read them", async () => {
    const { org, event, as } = await community();
    await (await as("admin")).setShardDogDrop({ organizationId: org, dropId: "member-drop" });

    for (const client of [await as("member"), await as(null)]) {
      await expect(
        client.setShardDogDrop({ organizationId: org, dropId: "stolen" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        client.setShardDogDrop({ organizationId: org, eventId: event.id, dropId: "stolen" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      (await getPluginClient()).setShardDogDrop({ organizationId: org, dropId: "stolen" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(await (await getPluginClient()).getShardDogDrops({ organizationId: org })).toMatchObject(
      { canEdit: false, membershipDropId: "member-drop" },
    );
    expect(await (await as("member")).getShardDogDrops({ organizationId: org })).toMatchObject({
      canEdit: false,
    });
  });

  it("shows visitors and members only public events, while editors see drafts and scheduled ones", async () => {
    const { org, event, editor, nodeId, as } = await community();
    const soon = new Date(Date.now() + 48 * HOUR);
    const draft = await editor.saveDiscoveryActivity({
      ...eventInput(nodeId, "Secret launch", soon),
      status: "draft",
    });
    const scheduled = await editor.saveDiscoveryActivity({
      ...eventInput(nodeId, "Announced later", soon),
      publishedAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    });

    for (const client of [await getPluginClient(), await as("member"), await as(null)]) {
      const read = await client.getShardDogDrops({ organizationId: org });
      expect(read.canEdit).toBe(false);
      expect(read.events.map((e) => e.eventId)).toEqual([event.id]);
    }

    const admin = await (await as("admin")).getShardDogDrops({ organizationId: org });
    expect(admin.events.map((e) => e.eventId).sort()).toEqual(
      [event.id, draft.id, scheduled.id].sort(),
    );
  });

  it("rejects an event from another community and an unknown community", async () => {
    const first = await community();
    const second = await community();
    await expect(
      (await first.as("admin")).setShardDogDrop({
        organizationId: first.org,
        eventId: second.event.id,
        dropId: "wrong-event",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      (await getPluginClient()).getShardDogDrops({ organizationId: "no-such-community" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects drop ids that aren't plain identifiers", async () => {
    const { org, as } = await community();
    await expect(
      (await as("admin")).setShardDogDrop({ organizationId: org, dropId: "drop/../x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

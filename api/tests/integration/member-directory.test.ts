import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

type StubMember = { userId: string; name: string | null };

const membersByOrg = new Map<string, StubMember[]>();
const accountsByUser = new Map<string, string | null>();
const failingAccountReads = new Set<string>();
const failingMemberOrgs = new Set<string>();
const memberPages: Array<{ limit?: number; offset?: number }> = [];
const UPSTREAM_PAGE_LIMIT = 100;

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

const authStub = {
  client: (context: unknown) => ({
    nearListAccounts: async () => {
      const userId = callerId(context);
      if (failingAccountReads.has(userId)) throw new Error("identity read failed");
      const accountId = accountsByUser.get(userId);
      return {
        accounts: accountId
          ? [
              {
                id: `acc-${userId}-other`,
                userId,
                accountId: `other-${userId}.near`,
                network: "mainnet",
                publicKey: "ed25519:other",
                isPrimary: false,
                createdAt: new Date(),
              },
              {
                id: `acc-${userId}`,
                userId,
                accountId,
                network: "mainnet",
                publicKey: "ed25519:key",
                isPrimary: true,
                createdAt: new Date(),
              },
            ]
          : [],
      };
    },
    listMembers: async (input: { organizationId?: string; limit?: number; offset?: number }) => {
      const organizationId = input.organizationId ?? "";
      memberPages.push({ limit: input.limit, offset: input.offset });
      if (failingMemberOrgs.has(organizationId)) throw new Error("upstream down");
      const members = membersByOrg.get(organizationId) ?? [];
      if (!members.some((member) => member.userId === callerId(context))) {
        throw new ORPCError("FORBIDDEN", { message: "Not a member" });
      }
      const offset = input.offset ?? 0;
      const limit = Math.min(input.limit ?? UPSTREAM_PAGE_LIMIT, UPSTREAM_PAGE_LIMIT);
      return {
        total: members.length,
        members: members.slice(offset, offset + limit).map((member) => ({
          id: `member-${member.userId}`,
          userId: member.userId,
          organizationId,
          role: member.userId === "owner" ? "owner" : "member",
          createdAt: new Date(),
          user: {
            id: member.userId,
            name: member.name,
            email: `${member.userId}@example.com`,
            image: null,
          },
        })),
      };
    },
  }),
  router: {},
};

function memberClient(userId: string) {
  return getPluginClient({
    ...authedContext(userId),
    reqHeaders: { cookie: `better-auth.session_token=${userId}` },
  });
}

async function community(members: StubMember[]) {
  const id = crypto.randomUUID().slice(0, 8);
  const orgId = `directory-${id}`;
  membersByOrg.set(orgId, members);
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, orgId, `md-${id}.near`));
  const tenant = await provisioner.createTenant({
    name: "Directory city",
    accountId: `md-${id}.near`,
  });
  const node = await provisioner.createNode({
    name: "Directory city",
    slug: `directory-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return { orgId, nodeId: node.id };
}

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  accountsByUser.clear();
  failingAccountReads.clear();
  failingMemberOrgs.clear();
  memberPages.length = 0;
});

describe("member directory opt-in", () => {
  it("is off by default and only changes the signed-in user's own opt-in", async () => {
    const alice = await memberClient(`alice-${crypto.randomUUID()}`);
    const bobId = `bob-${crypto.randomUUID()}`;
    const bob = await memberClient(bobId);
    expect(await alice.getMemberDirectoryOptIn()).toEqual({ optedIn: false });
    await alice.setMemberDirectoryOptIn({ optedIn: true, userId: bobId } as never);
    expect(await alice.getMemberDirectoryOptIn()).toEqual({ optedIn: true });
    expect(await bob.getMemberDirectoryOptIn()).toEqual({ optedIn: false });
    const anonymous = await getPluginClient();
    await expect(anonymous.getMemberDirectoryOptIn()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.setMemberDirectoryOptIn({ optedIn: true })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("member directory", () => {
  it("counts every member, names only opted-in ones and never returns an email", async () => {
    const longName = "A".repeat(300);
    const { orgId } = await community([
      { userId: "owner", name: "Owner Person" },
      { userId: "linked", name: "  Linked Member  " },
      { userId: "unlinked", name: longName },
      { userId: "blank", name: "   " },
      { userId: "private", name: "Private Person" },
    ]);
    accountsByUser.set("linked", "linked.near");
    for (const userId of ["linked", "unlinked", "blank"]) {
      await (await memberClient(userId)).setMemberDirectoryOptIn({ optedIn: true });
    }
    await (await memberClient("private")).setMemberDirectoryOptIn({ optedIn: false });

    const directory = await (await memberClient("owner")).getMemberDirectory({
      organizationId: orgId,
    });

    expect(directory.count).toBe(5);
    expect(directory.members).toEqual([
      { userId: "linked", name: "Linked Member", accountId: "linked.near" },
      { userId: "unlinked", name: longName, accountId: null },
      { userId: "blank", name: null, accountId: null },
    ]);
    expect(JSON.stringify(directory)).not.toContain("@example.com");
    expect(JSON.stringify(directory)).not.toContain("Private Person");
    expect(JSON.stringify(directory)).not.toContain("Owner Person");
  });

  it("requires verified membership in the requested community", async () => {
    const { orgId } = await community([{ userId: "insider", name: "Insider" }]);
    await expect(
      (await memberClient("outsider")).getMemberDirectory({ organizationId: orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await getPluginClient()).getMemberDirectory({ organizationId: orgId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("drops a member who opts out or leaves the community", async () => {
    const { orgId } = await community([
      { userId: "viewer", name: "Viewer" },
      { userId: "leaver", name: "Leaver" },
      { userId: "quitter", name: "Quitter" },
    ]);
    for (const userId of ["leaver", "quitter"]) {
      await (await memberClient(userId)).setMemberDirectoryOptIn({ optedIn: true });
    }
    const viewer = await memberClient("viewer");
    expect(
      (await viewer.getMemberDirectory({ organizationId: orgId })).members.map((m) => m.userId),
    ).toEqual(["leaver", "quitter"]);

    await (await memberClient("quitter")).setMemberDirectoryOptIn({ optedIn: false });
    membersByOrg.set(
      orgId,
      (membersByOrg.get(orgId) ?? []).filter((member) => member.userId !== "leaver"),
    );

    const after = await viewer.getMemberDirectory({ organizationId: orgId });
    expect(after.members).toEqual([]);
    expect(after.count).toBe(2);
  });

  it("refreshes the viewer's own link on open and clears stale or unreadable accounts", async () => {
    const { orgId } = await community([
      { userId: "changer", name: "Changer" },
      { userId: "failer", name: "Failer" },
    ]);
    accountsByUser.set("changer", "first.near");
    accountsByUser.set("failer", "failer.near");
    const changer = await memberClient("changer");
    const failer = await memberClient("failer");
    await changer.setMemberDirectoryOptIn({ optedIn: true });
    await failer.setMemberDirectoryOptIn({ optedIn: true });
    const accountOf = async (userId: string) =>
      (await changer.getMemberDirectory({ organizationId: orgId })).members.find(
        (member) => member.userId === userId,
      )?.accountId;

    expect(await accountOf("changer")).toBe("first.near");
    accountsByUser.set("changer", "second.near");
    expect(await accountOf("changer")).toBe("second.near");
    accountsByUser.set("changer", null);
    expect(await accountOf("changer")).toBeNull();

    expect(await accountOf("failer")).toBe("failer.near");
    failingAccountReads.add("failer");
    await failer.getMemberDirectory({ organizationId: orgId });
    expect(await accountOf("failer")).toBeNull();
  });

  it("pages through the whole upstream member source before filtering", async () => {
    const members = Array.from({ length: 250 }, (_, index) => ({
      userId: `bulk-${index}`,
      name: `Bulk ${index}`,
    }));
    const { orgId } = await community(members);
    await (await memberClient("bulk-240")).setMemberDirectoryOptIn({ optedIn: true });

    const directory = await (await memberClient("bulk-0")).getMemberDirectory({
      organizationId: orgId,
    });

    expect(directory.count).toBe(250);
    expect(directory.members).toEqual([{ userId: "bulk-240", name: "Bulk 240", accountId: null }]);
    expect(memberPages.map((page) => page.offset)).toEqual([0, 100, 200]);
  });
});

describe("public member count", () => {
  it("is unavailable until a member observes it, then keeps the last observation", async () => {
    const { orgId, nodeId } = await community([
      { userId: "counter", name: "Counter" },
      { userId: "named", name: "Named" },
    ]);
    await (await memberClient("named")).setMemberDirectoryOptIn({ optedIn: true });
    const visitor = await getPluginClient();
    expect(await visitor.getNodeMemberCount({ nodeId })).toEqual({
      count: null,
      observedAt: null,
    });

    const counter = await memberClient("counter");
    const directory = await counter.getMemberDirectory({ organizationId: orgId });
    const observed = await visitor.getNodeMemberCount({ nodeId });
    expect(observed).toEqual({ count: 2, observedAt: directory.observedAt });
    expect(JSON.stringify(observed)).not.toContain("Named");

    failingMemberOrgs.add(orgId);
    await expect(counter.getMemberDirectory({ organizationId: orgId })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(await visitor.getNodeMemberCount({ nodeId })).toEqual(observed);
  });

  it("is unavailable for an unknown community", async () => {
    expect(
      await (await getPluginClient()).getNodeMemberCount({ nodeId: crypto.randomUUID() }),
    ).toEqual({ count: null, observedAt: null });
  });
});

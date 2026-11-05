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
const roleLookups: string[] = [];
const accountReads: string[] = [];
const UPSTREAM_PAGE_LIMIT = 100;

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

const authStub = {
  client: (context: unknown) => ({
    nearListAccounts: async () => {
      const userId = callerId(context);
      accountReads.push(userId);
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
    getActiveMemberRole: async (input: { organizationId?: string }) => {
      const organizationId = input.organizationId ?? "";
      roleLookups.push(organizationId);
      const members = membersByOrg.get(organizationId) ?? [];
      if (!members.some((member) => member.userId === callerId(context))) {
        throw new ORPCError("FORBIDDEN", { message: "Not a member" });
      }
      return { role: callerId(context) === "owner" ? "owner" : "member" };
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
  roleLookups.length = 0;
  accountReads.length = 0;
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
    expect(roleLookups).toEqual([orgId]);
    expect(memberPages).toEqual([]);
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

  it("keeps reading upstream pages until it has a name to show and returns a cursor to the rest", async () => {
    const members = Array.from({ length: 350 }, (_, index) => ({
      userId: `bulk-${index}`,
      name: `Bulk ${index}`,
    }));
    const { orgId } = await community(members);
    for (const userId of ["bulk-205", "bulk-340"]) {
      await (await memberClient(userId)).setMemberDirectoryOptIn({ optedIn: true });
    }
    const viewer = await memberClient("bulk-0");

    const first = await viewer.getMemberDirectory({ organizationId: orgId });
    expect(first.count).toBe(350);
    expect(first.members.map((member) => member.userId)).toEqual(["bulk-205"]);
    expect(first.nextCursor).toBe("300");

    const last = await viewer.getMemberDirectory({
      organizationId: orgId,
      limit: 50,
      cursor: first.nextCursor ?? undefined,
    });
    expect(last.members).toEqual([{ userId: "bulk-340", name: "Bulk 340", accountId: null }]);
    expect(last.nextCursor).toBeNull();
    expect(memberPages).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
      { limit: 50, offset: 300 },
    ]);
  });

  it("stops after ten upstream pages in one request and returns a cursor", async () => {
    const { orgId } = await community(
      Array.from({ length: 1200 }, (_, index) => ({ userId: `cap-${index}`, name: null })),
    );
    await (await memberClient("cap-1150")).setMemberDirectoryOptIn({ optedIn: true });
    const viewer = await memberClient("cap-0");

    const first = await viewer.getMemberDirectory({ organizationId: orgId });
    expect(first.members).toEqual([]);
    expect(first.nextCursor).toBe("1000");
    expect(memberPages).toHaveLength(10);

    const next = await viewer.getMemberDirectory({ organizationId: orgId, cursor: "1000" });
    expect(next.members.map((member) => member.userId)).toEqual(["cap-1150"]);
    expect(next.nextCursor).toBeNull();
  });

  it("returns an empty directory without a cursor when nobody has opted in", async () => {
    const { orgId } = await community(
      Array.from({ length: 250 }, (_, index) => ({ userId: `none-${index}`, name: null })),
    );
    const viewer = await memberClient("none-0");
    const directory = await viewer.getMemberDirectory({ organizationId: orgId });
    expect(directory.members).toEqual([]);
    expect(directory.nextCursor).toBeNull();
    expect(memberPages).toHaveLength(3);
  });
});

describe("member directory upstream cost", () => {
  async function viewCost(size: number) {
    const { orgId } = await community(
      Array.from({ length: size }, (_, index) => ({ userId: `cost-${size}-${index}`, name: null })),
    );
    const viewerId = `cost-${size}-0`;
    await (await memberClient(viewerId)).setMemberDirectoryOptIn({ optedIn: true });
    const viewer = await memberClient(viewerId);
    const first = await viewer.getMemberDirectory({ organizationId: orgId });
    memberPages.length = 0;
    roleLookups.length = 0;
    accountReads.length = 0;
    const again = await viewer.getMemberDirectory({ organizationId: orgId });
    return {
      count: again.count,
      observedAt: [first.observedAt, again.observedAt],
      calls: memberPages.length + roleLookups.length + accountReads.length,
      pages: [...memberPages],
    };
  }

  it("makes the same upstream calls at any community size and does not rewrite the count", async () => {
    const small = await viewCost(1000);
    const large = await viewCost(5000);
    expect(small.count).toBe(1000);
    expect(large.count).toBe(5000);
    expect(small.calls).toBe(3);
    expect(large.calls).toBe(3);
    expect(large.pages).toEqual([{ limit: 100, offset: 0 }]);
    expect(small.observedAt[1]).toBe(small.observedAt[0]);
    expect(large.observedAt[1]).toBe(large.observedAt[0]);
  });

  it("rewrites the count when it changes", async () => {
    const { orgId, nodeId } = await community([
      { userId: "steady", name: null },
      { userId: "joiner", name: null },
    ]);
    const viewer = await memberClient("steady");
    await viewer.getMemberDirectory({ organizationId: orgId });
    membersByOrg.set(orgId, [...(membersByOrg.get(orgId) ?? []), { userId: "late", name: null }]);
    const changed = await viewer.getMemberDirectory({ organizationId: orgId });
    expect(changed.count).toBe(3);
    expect(await (await getPluginClient()).getNodeMemberCount({ nodeId })).toEqual({
      count: 3,
      observedAt: changed.observedAt,
    });
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

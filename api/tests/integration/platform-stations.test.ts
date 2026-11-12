import { ORPCError } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authedContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("../../plugin.dev", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugin.dev")>();
  return {
    default: {
      ...original.default,
      config: {
        ...original.default.config,
        variables: {
          ...original.default.config.variables,
          platformStationsAccount: "stations.citynode.testnet",
        },
      },
    },
  };
});

type FakeMember = { id: string; userId: string; organizationId: string; role: string };

type FakeOrganization = {
  id: string;
  name: string;
  slug: string;
  metadata: Record<string, unknown>;
  members: FakeMember[];
};

const organizations = new Map<string, FakeOrganization>();
const activeOrganizationCalls: Array<string | null> = [];
let counter = 0;

const adminContext = (userId: string) => ({
  ...authedContext(userId),
  user: { id: userId, email: `${userId}@example.com`, name: userId, role: "admin" },
});

function bySlug(slug: string) {
  return [...organizations.values()].find((organization) => organization.slug === slug);
}

function output(organization: FakeOrganization) {
  return {
    ...organization,
    members: organization.members.map((member) => ({ ...member, user: null })),
  };
}

function stored(organizationId: string) {
  const organization = organizations.get(organizationId);
  if (!organization) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
  return organization;
}

const fakeAuth = (context: unknown) => ({
  getActiveMemberRole: async ({ organizationId }: { organizationId: string }) => {
    const userId = (context as { userId?: string }).userId;
    const member = stored(organizationId).members.find((stored) => stored.userId === userId);
    if (!member) {
      throw new ORPCError("FORBIDDEN", { message: "User is not a member of the organization" });
    }
    return { role: member.role };
  },
  checkSlug: async ({ slug }: { slug: string }) => ({ status: !bySlug(slug) }),
  getFullOrganization: async ({ organizationId }: { organizationId: string }) => {
    const organization = stored(organizationId);
    const userId = (context as { userId?: string }).userId;
    if (!organization.members.some((member) => member.userId === userId)) {
      throw new ORPCError("FORBIDDEN", { message: "User is not a member of the organization" });
    }
    return output(organization);
  },
  createOrganization: async (input: {
    name: string;
    slug: string;
    metadata?: Record<string, unknown>;
  }) => {
    const organization: FakeOrganization = {
      id: `org-${++counter}`,
      name: input.name,
      slug: input.slug,
      metadata: input.metadata ?? {},
      members: [],
    };
    organization.members.push({
      id: `member-${++counter}`,
      userId: (context as { userId?: string }).userId ?? "",
      organizationId: organization.id,
      role: "owner",
    });
    organizations.set(organization.id, organization);
    return output(organization);
  },
  getOrganizationForAdmin: async ({ organizationId }: { organizationId: string }) => {
    const { members: _members, ...organization } = stored(organizationId);
    return organization;
  },
  addMember: async (input: { userId: string; role: string; organizationId: string }) => {
    const member = { id: `member-${++counter}`, ...input };
    stored(input.organizationId).members.push(member);
    return member;
  },
  deleteOrganization: async ({ organizationId }: { organizationId: string }) => {
    organizations.delete(organizationId);
    return null;
  },
  setActiveOrganization: async ({ organizationId }: { organizationId: string | null }) => {
    activeOrganizationCalls.push(organizationId);
    return null;
  },
});

describe("platform stations", () => {
  beforeAll(async () => {
    await getPluginClient(undefined, { auth: { client: fakeAuth, router: {} } } as never);
  });

  afterAll(async () => {
    await teardown();
  });

  it("keeps platform stations to platform admins", async () => {
    const member = await getPluginClient(authedContext("member"));
    await expect(member.getPlatformStations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      member.setUpPlatformStations({ name: "City Nodes", slug: "city-nodes" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.joinPlatformStations()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a slug another organization holds, even one marked as the platform's", async () => {
    const squatter = await getPluginClient(authedContext("squatter"));
    const admin = await getPluginClient(adminContext("admin-one"));
    const squat = await fakeAuth({ userId: "squatter" }).createOrganization({
      name: "City Nodes",
      slug: "city-nodes-squat",
      metadata: { platformStations: "true" },
    });

    await expect(
      admin.setUpPlatformStations({ name: "City Nodes", slug: "city-nodes-squat" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(stored(squat.id).members.map(({ userId }) => userId)).toEqual(["squatter"]);
    await expect(squatter.getPlatformStations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.getPlatformStations()).organization).toBeNull();
  });

  it("sets up a platform organization owned by the admin behind a hidden node", async () => {
    const admin = await getPluginClient(adminContext("admin-one"));
    expect(await admin.getPlatformStations()).toEqual({
      account: "stations.citynode.testnet",
      organization: null,
    });
    await expect(admin.joinPlatformStations()).rejects.toMatchObject({ code: "NOT_FOUND" });

    const setUp = await admin.setUpPlatformStations({ name: "City Nodes", slug: "city-nodes" });
    expect(activeOrganizationCalls).toEqual([null]);
    expect(setUp).toMatchObject({
      account: "stations.citynode.testnet",
      organization: { name: "City Nodes", slug: "city-nodes", role: "owner" },
    });
    const organization = bySlug("city-nodes");
    expect(organization).toMatchObject({ metadata: { platformStations: "true" } });

    const node = await admin.getNode({ nodeId: setUp.organization?.nodeId ?? "" });
    expect(node).toMatchObject({ kind: "platform", slug: "city-nodes", parentId: null });

    await expect(
      admin.setUpPlatformStations({ name: "City Nodes", slug: "city-nodes-2" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("adds another platform admin as an organizer of the platform organization", async () => {
    const second = await getPluginClient(adminContext("admin-two"));
    expect((await second.getPlatformStations()).organization?.role).toBeNull();
    const joined = await second.joinPlatformStations();
    expect(joined.organization?.role).toBe("admin");
    expect((await second.joinPlatformStations()).organization?.role).toBe("admin");
  });

  it("lists the platform node only to platform admins who ask for it by kind or tenant", async () => {
    const publicClient = await getPluginClient();
    const admin = await getPluginClient(adminContext("admin-one"));
    const { organization } = await admin.getPlatformStations();
    const nodeId = organization?.nodeId;
    expect(nodeId).toBeTruthy();
    const ids = (nodes: { id: string }[]) => nodes.map((node) => node.id);
    const [platformNode] = await admin.listNodes({ kind: "platform" });
    const tenantId = platformNode?.tenantId ?? "";

    expect((await publicClient.listNodes({})).map((node) => node.id)).not.toContain(nodeId);
    expect(
      (await publicClient.listNodeSummaries({ scope: "all" })).map(({ node }) => node.id),
    ).not.toContain(nodeId);
    expect((await publicClient.listRootNodes()).map((node) => node.id)).not.toContain(nodeId);
    expect((await publicClient.listTenantApps()).map((app) => app.node?.id)).not.toContain(nodeId);
    expect((await publicClient.listDiscovery({})).map((node) => node.nodeId)).not.toContain(nodeId);
    expect(await publicClient.listNodes({ kind: "platform" })).toEqual([]);
    expect(ids(await publicClient.listNodes({ tenantId }))).not.toContain(nodeId);
    expect(await publicClient.listNodeSummaries({ scope: "all", kind: "platform" })).toEqual([]);

    expect(ids(await admin.listNodes({}))).not.toContain(nodeId);
    expect(ids(await admin.listNodes({ tenantId }))).toEqual([nodeId]);
    expect(
      (await admin.listNodeSummaries({ scope: "all", kind: "platform" })).map(
        ({ node }) => node.id,
      ),
    ).toEqual([nodeId]);
  });

  it("marks platform events in Admin Events as having no public page", async () => {
    const admin = await getPluginClient(adminContext("admin-one"));
    const { organization } = await admin.getPlatformStations();
    const nodeId = organization?.nodeId ?? "";
    const now = Date.now();
    const event = await admin.saveDiscoveryActivity({
      ownerNodeId: nodeId,
      nodeIds: [nodeId],
      kind: "event",
      title: "Platform build night",
      summary: "Stations at the door",
      url: `https://example.com/events/${crypto.randomUUID()}`,
      source: "Platform",
      publishedAt: new Date(now).toISOString(),
      startsAt: new Date(now - 5 * 3_600_000).toISOString(),
      endsAt: new Date(now - 2 * 3_600_000).toISOString(),
      timezone: "UTC",
      venue: "Town Hall",
      status: "published",
    });
    const { events } = await admin.getAdminEvents();
    expect(events.find(({ id }) => id === event.id)).toMatchObject({
      nodeId,
      publicPage: false,
    });
  });

  it("never expects a monthly report from the platform organization", async () => {
    const admin = await getPluginClient(adminContext("admin-one"));
    const { organization } = await admin.getPlatformStations();
    const month = new Date().toISOString().slice(0, 7);
    const { communities } = await admin.getAdminMonthlyReports({ month });
    expect(communities.map((community) => community.nodeId)).not.toContain(organization?.nodeId);
  });

  it("reserves the platform kind for platform stations", async () => {
    const admin = await getPluginClient(orgContext("admin-one", "org-elsewhere", "owner", "admin"));
    await expect(
      admin.spawnNode({ kind: "platform", slug: "sneaky", name: "Sneaky" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.spawnNode({ slug: "sneaky", name: "Sneaky", metadata: { kind: "platform" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const standalone = await admin.spawnNode({
      kind: "city",
      slug: "standalone",
      name: "Standalone",
    });
    await expect(
      admin.updateNode({ nodeId: standalone.id, kind: "platform" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const { organization } = await admin.getPlatformStations();
    await expect(
      admin.updateNode({ nodeId: organization?.nodeId ?? "", kind: "city" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets another platform admin finish a setup that stopped before the node was created", async () => {
    const owner = await getPluginClient(adminContext("admin-one"));
    const { organization } = await owner.getPlatformStations();
    const organizationId = organization?.id ?? "";
    const operator = await getPluginClient(
      orgContext("admin-one", organizationId, "admin", "admin"),
    );
    await operator.deleteNode({ nodeId: organization?.nodeId ?? "" });
    expect((await owner.getPlatformStations()).organization).toBeNull();

    const other = await getPluginClient(adminContext("admin-three"));
    const organizationCount = organizations.size;
    const resumed = await other.setUpPlatformStations({ name: "City Nodes", slug: "city-nodes-3" });
    expect(resumed.organization).toMatchObject({ id: organizationId, role: null });
    expect(organizations.size).toBe(organizationCount);
  });
});

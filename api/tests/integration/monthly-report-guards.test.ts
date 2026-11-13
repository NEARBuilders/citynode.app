import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext, teardown } from "../setup";

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
        variables: {
          ...original.default.config.variables,
          platformStationsAccount: "stations-guards.citynode.testnet",
        },
      },
    },
  };
});

type FakeOrganization = {
  id: string;
  name: string;
  slug: string;
  metadata: Record<string, unknown>;
  members: Array<{ id: string; userId: string; organizationId: string; role: string }>;
};

const organizations = new Map<string, FakeOrganization>();
const failingEvents = new Set<string>();
const NOW = "2026-12-10T12:00:00.000Z";
let counter = 0;

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

function stored(organizationId: string) {
  const organization = organizations.get(organizationId);
  if (!organization) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
  return organization;
}

const authStub = {
  client: (context: unknown) => ({
    getActiveMemberRole: async ({ organizationId }: { organizationId: string }) => {
      const member = organizations
        .get(organizationId)
        ?.members.find((candidate) => candidate.userId === callerId(context));
      return { role: member?.role ?? null };
    },
    checkSlug: async ({ slug }: { slug: string }) => ({
      status: ![...organizations.values()].some((organization) => organization.slug === slug),
    }),
    createOrganization: async (input: {
      name: string;
      slug: string;
      metadata?: Record<string, unknown>;
    }) => {
      const id = `guards-org-${++counter}`;
      const organization: FakeOrganization = {
        id,
        name: input.name,
        slug: input.slug,
        metadata: input.metadata ?? {},
        members: [
          {
            id: `member-${++counter}`,
            userId: callerId(context),
            organizationId: id,
            role: "owner",
          },
        ],
      };
      organizations.set(id, organization);
      return organization;
    },
    getOrganizationForAdmin: async ({ organizationId }: { organizationId: string }) => {
      const { members: _members, ...organization } = stored(organizationId);
      return organization;
    },
    setActiveOrganization: async () => null,
    deleteOrganization: async ({ organizationId }: { organizationId: string }) => {
      organizations.delete(organizationId);
      return null;
    },
    getOnboardingStats: async ({ month }: { month: string; organizationId: string }) => ({
      month,
      totals: { redeemed: 0, newMembers: 0 },
      organizations: [],
    }),
    listOnboardingCodes: async ({ eventId }: { organizationId: string; eventId?: string }) => {
      if (eventId && failingEvents.has(eventId)) throw new Error("listing failed");
      return [];
    },
    getOnboardingStatus: async () => {
      throw new ORPCError("NOT_FOUND");
    },
  }),
  router: {},
};

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);
afterAll(teardown);
beforeEach(() => {
  failingEvents.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

const REPORTED = "2026-11";

const platformAdmin = () =>
  getPluginClient({
    ...authedContext("guards-admin"),
    user: { id: "guards-admin", email: "guards-admin@example.com", name: "Admin", role: "admin" },
  });

async function community() {
  const id = crypto.randomUUID().slice(0, 8);
  const org = `guards-${id}`;
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  const provisioner = await getPluginClient(daoContext(`prov-${id}`, org, `mg-${id}.near`));
  const tenant = await provisioner.createTenant({
    name: "Guarded City",
    accountId: `mg-${id}.near`,
  });
  const node = await provisioner.createNode({
    name: "Guarded City",
    slug: `guarded-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  vi.setSystemTime(new Date(NOW));
  return {
    org,
    node,
    owner: await getPluginClient(orgContext(`owner-${id}`, org)),
    suspend: () => provisioner.updateTenant({ tenantId: tenant.id, status: "suspended" }),
    remove: async () =>
      (await getPluginClient(orgContext(`owner-${id}`, org, "owner"))).deleteTenant({
        tenantId: tenant.id,
      }),
  };
}

function monthlyCalls(
  client: Awaited<ReturnType<typeof getPluginClient>>,
  nodeId: string,
  { write = true } = {},
) {
  return [
    () => client.getMonthlyReport({ nodeId, month: REPORTED }),
    () => client.listMonthlyReportStatuses({ nodeId }),
    ...(write ? [() => client.saveMonthlyReport({ nodeId, month: REPORTED, notes: "Hi" })] : []),
  ];
}

describe("monthly reports admins will never see", () => {
  it("refuses them for a suspended or deleted community", async () => {
    for (const close of ["suspend", "remove"] as const) {
      const city = await community();
      const admin = await platformAdmin();
      expect(
        await city.owner.getMonthlyReport({ nodeId: city.node.id, month: REPORTED }),
      ).toMatchObject({ canEdit: true, open: true });
      await city[close]();
      for (const call of [
        ...monthlyCalls(city.owner, city.node.id),
        ...monthlyCalls(admin, city.node.id, { write: false }),
      ]) {
        await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    }
  });

  it("refuses them for a community with no listed node", async () => {
    const admin = await platformAdmin();
    const { organization } = await admin.setUpPlatformStations({
      name: "Guarded Stations",
      slug: "guarded-stations",
    });
    const nodeId = organization?.nodeId ?? "";
    expect(nodeId).toBeTruthy();
    for (const call of monthlyCalls(admin, nodeId, { write: false })) {
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("the monthly report's check-in sync time", () => {
  it("isn't reported as fresh while any part of the last sync failed", async () => {
    const city = await community();
    const event = await city.owner.saveDiscoveryActivity({
      ownerNodeId: city.node.id,
      nodeIds: [city.node.id],
      kind: "event",
      title: "Builders Night",
      summary: "Meet the builders",
      url: `https://example.com/events/${crypto.randomUUID()}`,
      source: "Community",
      publishedAt: "2026-12-01T12:00:00.000Z",
      startsAt: "2026-12-08T18:00:00.000Z",
      endsAt: "2026-12-08T20:00:00.000Z",
      timezone: "UTC",
      venue: "Town Hall",
      status: "published",
    });
    const syncedAt = async () =>
      (await city.owner.getMonthlyReport({ nodeId: city.node.id, month: REPORTED }))
        .checkInsSyncedAt;

    expect(await city.owner.reconcileAttendance({ organizationId: city.org })).toMatchObject({
      failed: [],
    });
    expect(await syncedAt()).toBe(NOW);

    const later = "2026-12-10T13:00:00.000Z";
    vi.setSystemTime(new Date(later));
    failingEvents.add(event.id);
    expect((await city.owner.reconcileAttendance({ organizationId: city.org })).failed).toEqual([
      event.id,
    ]);
    expect(await syncedAt()).toBeNull();

    failingEvents.clear();
    await city.owner.reconcileAttendance({ organizationId: city.org });
    expect(await syncedAt()).toBe(later);
  });
});

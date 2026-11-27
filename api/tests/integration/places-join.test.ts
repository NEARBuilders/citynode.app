import { rmSync } from "node:fs";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";
import {
  nodes as nodesTable,
  placeAliases,
  places as placesTable,
  tenants as tenantsTable,
} from "@/db/schema";
import { buildPlacesCatalog, seedPlacesInto } from "@/seed/places-catalog";
import { nodesTestingDatabase } from "@/services/nodes";
import pluginDevConfig from "../../plugin.dev";
import { authedContext, getPluginClient, teardown } from "../setup";

const databaseUrl = await vi.hoisted(async () => {
  const external = process.env.JOIN_CODE_TEST_DATABASE_URL?.trim();
  if (external) {
    process.env.API_TEST_DATABASE_URL = external;
    process.env.API_DATABASE_URL = external;
    return external;
  }
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "places-join-"));
  const url = `pglite:${dir}`;
  process.env.API_TEST_DATABASE_URL = url;
  process.env.API_DATABASE_URL = url;
  return url;
});

const orgsBySlug = new Map<string, { id: string; name: string; slug: string }>();
const codesBySlug = new Map<string, string>();
const membersByOrg = new Map<string, Set<string>>();
const memberRoles = new Map<string, Map<string, string>>();
const redemptionCalls: Array<{ userId: string; code: string; threw: string | null }> = [];
const clientContexts: Array<Record<string, unknown>> = [];
const codeRequests: Array<{ organizationId: string; maxUses?: number; expiresAt?: Date }> = [];
const deletedOrganizations: string[] = [];
const organizerOnly = new Set<string>();
const adminMembershipCalls: Array<{
  action: "add" | "remove" | "update";
  organizationId: string;
  userId: string;
  role?: string;
}> = [];
const hiddenMemberOrgs = new Set<string>();
let failNextCodeCreation = false;
let beforeNextOrganization: (() => Promise<unknown>) | null = null;

function rememberMember(organizationId: string, userId: string, role: string) {
  const set = membersByOrg.get(organizationId) ?? new Set<string>();
  set.add(userId);
  membersByOrg.set(organizationId, set);
  const roles = memberRoles.get(organizationId) ?? new Map<string, string>();
  roles.set(userId, role);
  memberRoles.set(organizationId, roles);
}

function forgetMember(organizationId: string, userId: string) {
  membersByOrg.get(organizationId)?.delete(userId);
  memberRoles.get(organizationId)?.delete(userId);
}

function callerIds(clientContext: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (typeof clientContext.userId === "string") ids.push(clientContext.userId);
  return ids;
}

function authStubFor(context: unknown) {
  const userId = (context as { userId?: string }).userId ?? "anonymous";
  return {
    client: (clientContext: Record<string, unknown> = {}) => {
      clientContexts.push(clientContext);
      return {
        createOrganization: async (input: { name: string; slug: string }) => {
          const pending = beforeNextOrganization;
          beforeNextOrganization = null;
          if (pending) await pending();
          const id = `org-${input.slug}`;
          if (orgsBySlug.has(id)) {
            throw new ORPCError("CONFLICT", { message: "Organization already exists" });
          }
          orgsBySlug.set(id, { id, name: input.name, slug: input.slug });
          return orgsBySlug.get(id)!;
        },
        deleteOrganization: async (input: { organizationId: string }) => {
          deletedOrganizations.push(input.organizationId);
          orgsBySlug.delete(input.organizationId);
          return { success: true };
        },
        addMember: async (input: { userId: string; role: string; organizationId: string }) => {
          rememberMember(input.organizationId, input.userId, input.role);
          const set = membersByOrg.get(input.organizationId) ?? new Set<string>();
          return {
            id: `member-${set.size}`,
            userId: input.userId,
            organizationId: input.organizationId,
            role: input.role,
            createdAt: new Date(),
          };
        },
        createOnboardingCode: async (input: {
          organizationId: string;
          eventId: string;
          eventName: string;
          maxUses?: number;
          expiresAt?: Date;
        }) => {
          if (organizerOnly.has(input.organizationId)) {
            const allowed = callerIds(clientContext).some((id) => {
              const role = memberRoles.get(input.organizationId)?.get(id) ?? "";
              return role
                .split(",")
                .some((entry) => entry.trim() === "admin" || entry.trim() === "owner");
            });
            if (!allowed) throw new ORPCError("FORBIDDEN", { message: "Forbidden" });
          }
          codeRequests.push({
            organizationId: input.organizationId,
            maxUses: input.maxUses,
            expiresAt: input.expiresAt,
          });
          if (failNextCodeCreation) {
            failNextCodeCreation = false;
            throw new Error("code creation failed");
          }
          const org = [...orgsBySlug.values()].find((o) => o.id === input.organizationId);
          const code = `join-code-${org?.slug ?? input.organizationId}`;
          codesBySlug.set(org?.slug ?? organizationSlugOf(input.organizationId), code);
          return {
            id: `code-${input.organizationId}`,
            code,
            eventId: input.eventId,
            eventName: input.eventName,
            teamId: "join-team",
            role: "member",
            maxUses: 0,
            usedCount: 0,
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date(),
          };
        },
        redeemOnboardingCode: async (input: { code: string }) => {
          const entry = [...codesBySlug.entries()].find(([, code]) => code === input.code);
          const orgSlug = entry?.[0];
          const org = orgSlug ? orgsBySlug.get(`org-${orgSlug}`) : undefined;
          if (!org) {
            redemptionCalls.push({ userId, code: input.code, threw: "org not found" });
            throw new Error("onboarding code not found");
          }
          const set = membersByOrg.get(org.id) ?? new Set<string>();
          if (set.has(userId)) {
            redemptionCalls.push({ userId, code: input.code, threw: "already member" });
            throw new Error(`user ${userId} is already a member of this organization`);
          }
          set.add(userId);
          membersByOrg.set(org.id, set);
          redemptionCalls.push({ userId, code: input.code, threw: null });
          return {
            organizationId: org.id,
            organizationName: org.name,
            eventName: `Join ${org.name}`,
          };
        },
        getSession: async () => {
          const user = (clientContext.user ?? {}) as {
            id?: string;
            role?: string;
            name?: string;
            email?: string;
          };
          const id =
            user.id ??
            (typeof clientContext.userId === "string" ? clientContext.userId : "anonymous");
          const role = user.role ?? null;
          return {
            session: null,
            user: {
              id,
              name: user.name ?? "Test User",
              email: user.email ?? `${id}@example.com`,
              emailVerified: true,
              image: null,
              role,
              isAnonymous: false,
              locale: null,
            },
          };
        },
        getActiveMemberRole: async (input: { organizationId?: string }) => {
          const organizationId = input.organizationId ?? "";
          const caller =
            ((clientContext.user ?? {}) as { id?: string }).id ??
            (typeof clientContext.userId === "string" ? clientContext.userId : "anonymous");
          if (
            hiddenMemberOrgs.has(organizationId) ||
            !membersByOrg.get(organizationId)?.has(caller)
          ) {
            throw new ORPCError("FORBIDDEN", { message: "Not a member" });
          }
          return { role: memberRoles.get(organizationId)?.get(caller) ?? "member" };
        },
        listMembers: async (input: { organizationId?: string }) => {
          const organizationId = input.organizationId ?? "";
          if (hiddenMemberOrgs.has(organizationId)) {
            throw new ORPCError("FORBIDDEN", { message: "Forbidden" });
          }
          const members = [...(membersByOrg.get(organizationId) ?? [])];
          return {
            members: members.map((memberId) => ({
              userId: memberId,
              role: memberRoles.get(organizationId)?.get(memberId) ?? "member",
            })),
            total: members.length,
          };
        },
        adminAddMember: async (input: { organizationId: string; userId: string; role: string }) => {
          adminMembershipCalls.push({
            action: "add",
            organizationId: input.organizationId,
            userId: input.userId,
          });
          rememberMember(input.organizationId, input.userId, input.role);
          const set = membersByOrg.get(input.organizationId) ?? new Set<string>();
          return {
            id: `admin-member-${set.size}`,
            userId: input.userId,
            organizationId: input.organizationId,
            role: input.role,
            createdAt: new Date(),
          };
        },
        adminUpdateMemberRole: async (input: {
          organizationId: string;
          userId: string;
          role: string;
        }) => {
          adminMembershipCalls.push({
            action: "update",
            organizationId: input.organizationId,
            userId: input.userId,
            role: input.role,
          });
          rememberMember(input.organizationId, input.userId, input.role);
          return {
            id: `role-${input.userId}`,
            userId: input.userId,
            organizationId: input.organizationId,
            role: input.role,
            createdAt: new Date(),
          };
        },
        adminRemoveMember: async (input: { organizationId: string; userId: string }) => {
          adminMembershipCalls.push({
            action: "remove",
            organizationId: input.organizationId,
            userId: input.userId,
          });
          forgetMember(input.organizationId, input.userId);
          return { success: true };
        },
        router: {},
      };
    },
  };
}

function organizationSlugOf(organizationId: string): string {
  return organizationId.replace(/^org-/, "");
}

function citySources() {
  const city = (id: string, name: string, admin1: string, population: number) =>
    [
      id,
      name,
      name,
      "",
      "41.85",
      "-87.65",
      "P",
      "PPL",
      "US",
      "",
      admin1,
      "",
      "",
      "",
      String(population),
    ]
      .concat(["", "", "UTC", "2026-01-01"])
      .join("\t");
  return {
    countryInfo:
      "US\tUSA\t.us\tUSA\tUnited States\tWashington\t9629091\t331000000\tNA\t.us\tUSD\tDollar\t1\t\t\ten-US\t6252001\tCA\t",
    admin1Codes: ["US.IL\tIllinois\tIllinois\t4896861", "US.NY\tNew York\tNew York\t5128638"].join(
      "\n",
    ),
    admin0Geojson: JSON.stringify({ type: "FeatureCollection", features: [] }),
    admin1Geojson: JSON.stringify({ type: "FeatureCollection", features: [] }),
    cities: [
      city("4887398", "Chicago", "IL", 2720546),
      city("5128581", "New York City", "NY", 8804190),
    ].join("\n"),
    supranationals: [],
    curatedAliases: [{ value: "nyc", geonameid: "5128581" }],
  };
}

let driver: Awaited<ReturnType<typeof createDatabaseDriver>>;

beforeAll(async () => {
  const slug = pluginMigrationSlug(pluginDevConfig.pluginId);
  const schemaName = `plugin_${slug}`;
  driver = await createDatabaseDriver(databaseUrl, schemaName);
  try {
    const { migrations } = await Effect.runPromise(loadMigrations);
    await Effect.runPromise(migrate(driver.db, migrations, getMigrationStorage(slug), schemaName));
    await driver.db
      .insert(placesTable)
      .values({ slug: "nigeria", name: "Nigeria", label: "country" });
    await driver.db.insert(placesTable).values({ slug: "ghana", name: "Ghana", label: "country" });
    await driver.db.insert(placesTable).values({ slug: "togo", name: "Togo", label: "country" });
    await driver.db.insert(placeAliases).values({
      value: "2328926",
      kind: "geonames",
      placeId: (await driver.db.select({ id: placesTable.id }).from(placesTable).limit(1))[0]!.id,
    });
    await seedPlacesInto(driver.db, buildPlacesCatalog(citySources()));
  } finally {
    await driver.close();
  }
  await getPluginClient(undefined, { auth: authStubFor({ userId: "boot" }) } as never);
}, 30_000);

afterAll(async () => {
  await teardown();
  if (databaseUrl.startsWith("pglite:")) {
    rmSync(databaseUrl.slice("pglite:".length), { recursive: true, force: true });
  }
});

function testingDb() {
  const db = nodesTestingDatabase.current;
  if (!db) throw new Error("nodes database is not ready");
  return db;
}

async function storedJoinCode(nodeId: string) {
  const [row] = await testingDb()
    .select({ metadata: nodesTable.metadata })
    .from(nodesTable)
    .where(eq(nodesTable.id, nodeId));
  return (row?.metadata as { joinCodeId?: unknown } | undefined)?.joinCodeId;
}

async function ensurePlace(slug: string, name: string) {
  const db = testingDb();
  await db
    .insert(placesTable)
    .values({ slug, name, label: "country" })
    .onConflictDoNothing({ target: placesTable.slug });
  const [place] = await db
    .select({ id: placesTable.id })
    .from(placesTable)
    .where(eq(placesTable.slug, slug));
  if (!place) throw new Error(`missing place ${slug}`);
  return place.id;
}

async function forgetJoinCode(slug: string) {
  const db = testingDb();
  const placeId = await ensurePlace(slug, slug);
  await db
    .update(nodesTable)
    .set({ metadata: sql`${nodesTable.metadata} - 'joinCodeId'` })
    .where(eq(nodesTable.placeId, placeId));
}

async function showOnMap(slug: string) {
  const db = testingDb();
  const placeId = await ensurePlace(slug, slug);
  const [node] = await db
    .select({ tenantId: nodesTable.tenantId })
    .from(nodesTable)
    .where(eq(nodesTable.placeId, placeId));
  if (!node) throw new Error(`missing node ${slug}`);
  if (node.tenantId) return;
  const [tenant] = await db
    .insert(tenantsTable)
    .values({ accountId: `${slug}.community.near`, name: slug, orgId: `org-${slug}` })
    .returning();
  if (!tenant) throw new Error(`tenant insert failed for ${slug}`);
  await db.update(nodesTable).set({ tenantId: tenant.id }).where(eq(nodesTable.placeId, placeId));
}

describe("places activation + join flow", () => {
  let nigeriaPlaceId = "";
  let nigeriaSlug = "nigeria";

  it("activates a place into a community with a standing join code", async () => {
    const caller = await getPluginClient(authedContext("activator-1"), {
      auth: authStubFor(authedContext("activator-1")),
    } as never);

    const result = await caller.activateCommunity({ place: "nigeria" });
    expect(result).toMatchObject({
      slug: "nigeria",
      placeId: expect.any(String),
      organizationId: "org-nigeria",
      joinCode: "join-code-nigeria",
      alreadyActivated: false,
    });
    nigeriaPlaceId = result.placeId;
    nigeriaSlug = result.slug;

    const activatorClient = clientContexts.at(-1);
    expect(activatorClient).toMatchObject({ userId: "activator-1", reqHeaders: {} });
    const request = codeRequests.at(-1);
    expect(request?.maxUses).toBe(500);
    expect(request?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 365 * 24 * 60 * 60 * 1000);
  });

  it("removes the new organization when activation fails so a retry succeeds", async () => {
    const caller = await getPluginClient(authedContext("activator-4"), {
      auth: authStubFor(authedContext("activator-4")),
    } as never);

    failNextCodeCreation = true;
    await expect(caller.activateCommunity({ place: "ghana" })).rejects.toBeDefined();
    expect(deletedOrganizations).toContain("org-ghana");

    const retried = await caller.activateCommunity({ place: "ghana" });
    expect(retried).toMatchObject({
      slug: "ghana",
      organizationId: "org-ghana",
      alreadyActivated: false,
    });
  });

  it("joins the community as a second user", async () => {
    const joinerContext = { ...authedContext("joiner-1"), session: { id: "session-joiner-1" } };
    const joiner = await getPluginClient(joinerContext, {
      auth: authStubFor(joinerContext),
    } as never);

    const result = await joiner.joinCommunity({ placeId: nigeriaPlaceId });
    expect(clientContexts.at(-1)).toMatchObject({
      userId: "joiner-1",
      session: { id: "session-joiner-1" },
    });
    expect(result).toMatchObject({
      organizationId: "org-nigeria",
      alreadyMember: false,
    });

    const again = await joiner.joinCommunity({ placeId: nigeriaPlaceId });
    expect(
      again.alreadyMember,
      "DUMP " +
        JSON.stringify({
          redemptionCalls,
          members: [...membersByOrg.entries()].map(([org, set]) => [org, [...set]]),
          codes: [...codesBySlug.entries()],
        }),
    ).toBe(true);
  });

  it("re-activating an activated place is idempotent", async () => {
    const caller = await getPluginClient(authedContext("activator-2"), {
      auth: authStubFor(authedContext("activator-2")),
    } as never);

    const result = await caller.activateCommunity({ place: "nigeria" });
    expect(result.alreadyActivated).toBe(true);
    expect(result.organizationId).toBe("org-nigeria");
    expect(result.slug).toBe(nigeriaSlug);
  });

  it("returns the existing community when a concurrent activation wins the slug", async () => {
    const first = await getPluginClient(authedContext("racer-1"), {
      auth: authStubFor(authedContext("racer-1")),
    } as never);
    const second = await getPluginClient(authedContext("racer-2"), {
      auth: authStubFor(authedContext("racer-2")),
    } as never);

    beforeNextOrganization = () => second.activateCommunity({ place: "togo" });
    const result = await first.activateCommunity({ place: "togo" });
    expect(result).toMatchObject({
      slug: "togo",
      organizationId: "org-togo",
      alreadyActivated: true,
    });
  });

  it("activates and joins a seeded city through its short form", async () => {
    const activator = await getPluginClient(authedContext("city-activator"), {
      auth: authStubFor(authedContext("city-activator")),
    } as never);
    const activated = await activator.activateCommunity({ place: "nyc" });
    expect(activated).toMatchObject({
      slug: "new-york-city",
      organizationId: "org-new-york-city",
      alreadyActivated: false,
    });

    const joinerContext = { ...authedContext("city-joiner"), session: { id: "session-city" } };
    const joiner = await getPluginClient(joinerContext, {
      auth: authStubFor(joinerContext),
    } as never);
    const joined = await joiner.joinCommunity({ placeId: activated.placeId });
    expect(joined).toMatchObject({ organizationId: "org-new-york-city", alreadyMember: false });

    const chicago = await activator.activateCommunity({ place: "chicago" });
    expect(chicago).toMatchObject({ slug: "chicago", alreadyActivated: false });
  });

  it("restores join codes for Chicago, India, New York City and keeps Malaysia", async () => {
    const caller = await getPluginClient(authedContext("repair-activator"), {
      auth: authStubFor(authedContext("repair-activator")),
    } as never);
    await ensurePlace("india", "India");
    await ensurePlace("malaysia", "Malaysia");
    const india = await caller.activateCommunity({ place: "india" });
    const malaysia = await caller.activateCommunity({ place: "malaysia" });
    const chicago = await caller.activateCommunity({ place: "chicago" });
    const newYork = await caller.activateCommunity({ place: "nyc" });
    expect(chicago.slug).toBe("chicago");
    expect(newYork.slug).toBe("new-york-city");

    for (const slug of ["india", "malaysia", "chicago", "new-york-city"]) await showOnMap(slug);
    const mintedBefore = codeRequests.length;
    await forgetJoinCode("india");
    await forgetJoinCode("chicago");
    await forgetJoinCode("new-york-city");

    const db = testingDb();
    const [platformTenant] = await db
      .insert(tenantsTable)
      .values({ accountId: "platform.community.near", name: "Platform" })
      .returning();
    const [platform] = await db
      .insert(nodesTable)
      .values({
        tenantId: platformTenant?.id,
        orgId: "org-platform",
        metadata: { kind: "platform" },
      })
      .returning();

    const reader = await getPluginClient(authedContext("repair-reader"), {
      auth: authStubFor(authedContext("repair-reader")),
    } as never);
    await reader.listDiscovery({});
    await vi.waitFor(() => {
      const repairedOrgs = codeRequests
        .slice(mintedBefore)
        .map((request) => request.organizationId);
      expect(repairedOrgs).toEqual(
        expect.arrayContaining(["org-india", "org-chicago", "org-new-york-city"]),
      );
      expect(repairedOrgs).not.toContain("org-malaysia");
    });
    const listed = await reader.listDiscovery({});
    for (const slug of ["india", "chicago", "new-york-city", "malaysia"]) {
      expect(listed.find((entry) => entry.placeSlug === slug)).toMatchObject({ joinable: true });
    }
    expect(listed.find((entry) => entry.nodeId === platform?.id)).toBeUndefined();

    for (const activated of [india, chicago, newYork, malaysia]) {
      const node = await reader.getNode({ nodeId: activated.nodeId });
      expect(node?.metadata.joinCodeId).toBeUndefined();
      const stored = await storedJoinCode(activated.nodeId);
      expect(typeof stored).toBe("string");
      expect(String(stored).length).toBeGreaterThan(0);
    }
    await reader.getNode({ nodeId: platform!.id });
    expect(await storedJoinCode(platform!.id)).toBeUndefined();

    const anon = await getPluginClient();
    const anonListed = await anon.listDiscovery({});
    for (const slug of ["india", "chicago", "new-york-city", "malaysia"]) {
      expect(anonListed.find((entry) => entry.placeSlug === slug)).toMatchObject({
        joinable: true,
      });
    }

    const joiner = await getPluginClient(
      { ...authedContext("repair-joiner"), session: { id: "session-repair" } },
      { auth: authStubFor(authedContext("repair-joiner")) } as never,
    );
    await expect(joiner.joinCommunity({ placeId: india.placeId })).resolves.toMatchObject({
      organizationId: "org-india",
      alreadyMember: false,
    });
    await expect(joiner.joinCommunity({ placeId: chicago.placeId })).resolves.toMatchObject({
      organizationId: "org-chicago",
      alreadyMember: false,
    });
    await expect(joiner.joinCommunity({ placeId: malaysia.placeId })).resolves.toMatchObject({
      organizationId: "org-malaysia",
      alreadyMember: false,
    });
    await expect(joiner.joinCommunity({ placeId: newYork.placeId })).resolves.toMatchObject({
      organizationId: "org-new-york-city",
    });
  });

  it("lets a platform admin restore a join code a visitor cannot mint", async () => {
    try {
      await ensurePlace("kenya", "Kenya");
      const activator = await getPluginClient(authedContext("kenya-activator"), {
        auth: authStubFor(authedContext("kenya-activator")),
      } as never);
      const kenya = await activator.activateCommunity({ place: "kenya" });
      organizerOnly.add(kenya.organizationId);
      await forgetJoinCode("kenya");
      await showOnMap("kenya");
      adminMembershipCalls.length = 0;

      const visitor = await getPluginClient(authedContext("kenya-visitor"), {
        auth: authStubFor(authedContext("kenya-visitor")),
      } as never);
      await visitor.listDiscovery({});
      await visitor.getNode({ nodeId: kenya.nodeId });
      expect(await storedJoinCode(kenya.nodeId)).toBeUndefined();

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await admin.listDiscovery({});
      await admin.getNode({ nodeId: kenya.nodeId });
      expect(String(await storedJoinCode(kenya.nodeId)).length).toBeGreaterThan(0);
      expect(adminMembershipCalls).toEqual([
        { action: "add", organizationId: kenya.organizationId, userId: "repair-admin" },
        { action: "remove", organizationId: kenya.organizationId, userId: "repair-admin" },
      ]);
      expect(membersByOrg.get(kenya.organizationId)?.has("repair-admin")).toBeFalsy();

      const joiner = await getPluginClient(authedContext("kenya-joiner"), {
        auth: authStubFor(authedContext("kenya-joiner")),
      } as never);
      await expect(joiner.joinCommunity({ placeId: kenya.placeId })).resolves.toMatchObject({
        organizationId: kenya.organizationId,
        alreadyMember: false,
      });
    } finally {
      organizerOnly.delete("org-kenya");
    }
  });

  it("does not let a visitor who cannot mint hold back the next map repair", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 120_000);
    try {
      await ensurePlace("rwanda", "Rwanda");
      const activator = await getPluginClient(authedContext("rwanda-activator"), {
        auth: authStubFor(authedContext("rwanda-activator")),
      } as never);
      const rwanda = await activator.activateCommunity({ place: "rwanda" });
      organizerOnly.add(rwanda.organizationId);
      await forgetJoinCode("rwanda");
      await showOnMap("rwanda");

      const visitor = await getPluginClient(authedContext("rwanda-visitor"), {
        auth: authStubFor(authedContext("rwanda-visitor")),
      } as never);
      await visitor.listDiscovery({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await admin.listDiscovery({});

      const anon = await getPluginClient();
      await vi.waitFor(async () => {
        const listed = await anon.listDiscovery({});
        expect(listed.find((entry) => entry.placeSlug === "rwanda")).toMatchObject({
          joinable: true,
        });
      });
    } finally {
      organizerOnly.delete("org-rwanda");
      vi.useRealTimers();
    }
  });

  it("restores a join code when the platform admin is already a member", async () => {
    try {
      await ensurePlace("uganda", "Uganda");
      const activator = await getPluginClient(authedContext("uganda-activator"), {
        auth: authStubFor(authedContext("uganda-activator")),
      } as never);
      const uganda = await activator.activateCommunity({ place: "uganda" });
      organizerOnly.add(uganda.organizationId);
      rememberMember(uganda.organizationId, "repair-admin", "member");
      await forgetJoinCode("uganda");
      await showOnMap("uganda");
      adminMembershipCalls.length = 0;

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await admin.listDiscovery({});
      await admin.getNode({ nodeId: uganda.nodeId });
      expect(String(await storedJoinCode(uganda.nodeId)).length).toBeGreaterThan(0);
      expect(adminMembershipCalls).toEqual([
        {
          action: "update",
          organizationId: uganda.organizationId,
          userId: "repair-admin",
          role: "admin",
        },
        {
          action: "update",
          organizationId: uganda.organizationId,
          userId: "repair-admin",
          role: "member",
        },
      ]);
      expect(memberRoles.get(uganda.organizationId)?.get("repair-admin")).toBe("member");
    } finally {
      organizerOnly.delete("org-uganda");
    }
  });

  it("mints a join code when the organization hides its member list", async () => {
    try {
      await ensurePlace("ghana", "Ghana");
      const activator = await getPluginClient(authedContext("ghana-activator"), {
        auth: authStubFor(authedContext("ghana-activator")),
      } as never);
      const ghana = await activator.activateCommunity({ place: "ghana" });
      organizerOnly.add(ghana.organizationId);
      hiddenMemberOrgs.add(ghana.organizationId);
      await forgetJoinCode("ghana");
      adminMembershipCalls.length = 0;

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await admin.getNode({ nodeId: ghana.nodeId });
      expect(String(await storedJoinCode(ghana.nodeId)).length).toBeGreaterThan(0);
      expect(adminMembershipCalls).toEqual([
        { action: "add", organizationId: ghana.organizationId, userId: "repair-admin" },
        { action: "remove", organizationId: ghana.organizationId, userId: "repair-admin" },
      ]);
    } finally {
      hiddenMemberOrgs.delete("org-ghana");
      organizerOnly.delete("org-ghana");
    }
  });

  it("keeps a combined admin role and restores a combined member role", async () => {
    try {
      await ensurePlace("togo", "Togo");
      const activator = await getPluginClient(authedContext("togo-activator"), {
        auth: authStubFor(authedContext("togo-activator")),
      } as never);
      const togo = await activator.activateCommunity({ place: "togo" });
      organizerOnly.add(togo.organizationId);
      rememberMember(togo.organizationId, "repair-admin", "member,admin");
      await forgetJoinCode("togo");
      adminMembershipCalls.length = 0;

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await admin.getNode({ nodeId: togo.nodeId });
      expect(String(await storedJoinCode(togo.nodeId)).length).toBeGreaterThan(0);
      expect(adminMembershipCalls).toEqual([]);
      expect(memberRoles.get(togo.organizationId)?.get("repair-admin")).toBe("member,admin");

      await ensurePlace("benin", "Benin");
      const beninActivator = await getPluginClient(authedContext("benin-activator"), {
        auth: authStubFor(authedContext("benin-activator")),
      } as never);
      const benin = await beninActivator.activateCommunity({ place: "benin" });
      organizerOnly.add(benin.organizationId);
      rememberMember(benin.organizationId, "repair-admin", "member,events");
      await forgetJoinCode("benin");
      adminMembershipCalls.length = 0;
      await admin.getNode({ nodeId: benin.nodeId });
      expect(String(await storedJoinCode(benin.nodeId)).length).toBeGreaterThan(0);
      expect(adminMembershipCalls).toEqual([
        {
          action: "update",
          organizationId: benin.organizationId,
          userId: "repair-admin",
          role: "admin",
        },
        {
          action: "update",
          organizationId: benin.organizationId,
          userId: "repair-admin",
          role: "member,events",
        },
      ]);
      expect(memberRoles.get(benin.organizationId)?.get("repair-admin")).toBe("member,events");
    } finally {
      organizerOnly.delete("org-togo");
      organizerOnly.delete("org-benin");
    }
  });

  it("reports whether a community can be joined and whether the caller belongs", async () => {
    await ensurePlace("india", "India");
    await ensurePlace("malaysia", "Malaysia");
    const activator = await getPluginClient(authedContext("state-activator"), {
      auth: authStubFor(authedContext("state-activator")),
    } as never);
    const communities = [];
    for (const place of ["chicago", "india", "nyc", "malaysia"]) {
      communities.push(await activator.activateCommunity({ place }));
    }
    const [chicago, india] = communities;

    const anonymous = await getPluginClient();
    for (const community of communities) {
      await expect(anonymous.getCommunityJoinState({ nodeId: community.nodeId })).resolves.toEqual({
        joinable: true,
        member: false,
      });
    }

    const member = await getPluginClient({
      ...authedContext("state-member"),
      organizations: [{ id: chicago!.organizationId, role: "member" }],
    });
    await expect(member.getCommunityJoinState({ nodeId: chicago!.nodeId })).resolves.toEqual({
      joinable: true,
      member: true,
    });
    await expect(member.getCommunityJoinState({ nodeId: india!.nodeId })).resolves.toEqual({
      joinable: true,
      member: false,
    });

    await showOnMap("india");
    await testingDb()
      .update(tenantsTable)
      .set({ orgId: "org-india-official" })
      .where(
        sql`${tenantsTable.id} = (select ${nodesTable.tenantId} from ${nodesTable} where ${nodesTable.id} = ${india!.nodeId})`,
      );
    const official = await getPluginClient({
      ...authedContext("state-official"),
      organizations: [{ id: "org-india-official", role: "member" }],
    });
    await expect(official.getCommunityJoinState({ nodeId: india!.nodeId })).resolves.toEqual({
      joinable: true,
      member: true,
    });

    await testingDb()
      .update(tenantsTable)
      .set({ status: "suspended" })
      .where(eq(tenantsTable.orgId, "org-india-official"));
    await expect(official.getCommunityJoinState({ nodeId: india!.nodeId })).resolves.toEqual({
      joinable: false,
      member: true,
    });
    await testingDb()
      .update(tenantsTable)
      .set({ status: "active" })
      .where(eq(tenantsTable.orgId, "org-india-official"));

    await expect(
      anonymous.getCommunityJoinState({ nodeId: "00000000-0000-4000-8000-000000000000" }),
    ).resolves.toEqual({ joinable: false, member: false });
  });

  it("reports a community without a join code as not joinable until one can be made", async () => {
    try {
      await ensurePlace("senegal", "Senegal");
      const activator = await getPluginClient(authedContext("senegal-activator"), {
        auth: authStubFor(authedContext("senegal-activator")),
      } as never);
      const senegal = await activator.activateCommunity({ place: "senegal" });
      organizerOnly.add(senegal.organizationId);
      await forgetJoinCode("senegal");

      const anonymous = await getPluginClient();
      await expect(anonymous.getCommunityJoinState({ nodeId: senegal.nodeId })).resolves.toEqual({
        joinable: false,
        member: false,
      });

      const admin = await getPluginClient(authedContext("repair-admin", "admin"), {
        auth: authStubFor(authedContext("repair-admin", "admin")),
      } as never);
      await expect(admin.getCommunityJoinState({ nodeId: senegal.nodeId })).resolves.toEqual({
        joinable: true,
        member: false,
      });
    } finally {
      organizerOnly.delete("org-senegal");
    }
  });

  it("rejects unknown places", async () => {
    const caller = await getPluginClient(authedContext("activator-3"), {
      auth: authStubFor(authedContext("activator-3")),
    } as never);
    await expect(caller.activateCommunity({ place: "atlantis" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

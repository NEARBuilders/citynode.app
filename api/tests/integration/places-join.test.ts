import { rmSync } from "node:fs";
import { Effect } from "effect";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";
import { nodes, placeAliases, places as placesTable } from "@/db/schema";
import pluginDevConfig from "../../plugin.dev";
import { authedContext, getPluginClient, teardown } from "../setup";

const databaseDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "places-join-"));
  process.env.API_TEST_DATABASE_URL = `pglite:${dir}`;
  process.env.API_DATABASE_URL = `pglite:${dir}`;
  return dir;
});

const orgsBySlug = new Map<string, { id: string; name: string; slug: string }>();
const codesBySlug = new Map<string, string>();
const membersByOrg = new Map<string, Set<string>>();
const redemptionCalls: Array<{ userId: string; code: string; threw: string | null }> = [];

function authStubFor(context: unknown) {
  const userId = (context as { userId?: string }).userId ?? "anonymous";
  return {
    client: () => ({
      createOrganization: async (input: { name: string; slug: string }) => {
        const id = `org-${input.slug}`;
        if (!orgsBySlug.has(id)) {
          orgsBySlug.set(id, { id, name: input.name, slug: input.slug });
        }
        return orgsBySlug.get(id)!;
      },
      addMember: async (input: { userId: string; role: string; organizationId: string }) => {
        const set = membersByOrg.get(input.organizationId) ?? new Set<string>();
        set.add(input.userId);
        membersByOrg.set(input.organizationId, set);
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
      }) => {
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
      router: {},
    }),
  };
}

function organizationSlugOf(organizationId: string): string {
  return organizationId.replace(/^org-/, "");
}

let driver: Awaited<ReturnType<typeof createDatabaseDriver>>;

beforeAll(async () => {
  const slug = pluginMigrationSlug(pluginDevConfig.pluginId);
  const schemaName = `plugin_${slug}`;
  driver = await createDatabaseDriver(`pglite:${databaseDir}`, schemaName);
  try {
    const { migrations } = await Effect.runPromise(loadMigrations);
    await Effect.runPromise(migrate(driver.db, migrations, getMigrationStorage(slug), schemaName));
    await driver.db
      .insert(placesTable)
      .values({ slug: "nigeria", name: "Nigeria", label: "country" });
    await driver.db.insert(placeAliases).values({
      value: "2328926",
      kind: "geonames",
      placeId: (await driver.db.select({ id: placesTable.id }).from(placesTable).limit(1))[0]!.id,
    });
  } finally {
    await driver.close();
  }
  await getPluginClient(undefined, { auth: authStubFor({ userId: "boot" }) } as never);
}, 30_000);

afterAll(async () => {
  await teardown();
  rmSync(databaseDir, { recursive: true, force: true });
});

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
  });

  it("joins the community as a second user", async () => {
    const joiner = await getPluginClient(authedContext("joiner-1"), {
      auth: authStubFor(authedContext("joiner-1")),
    } as never);

    const result = await joiner.joinCommunity({ placeId: nigeriaPlaceId });
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

  it("rejects unknown places", async () => {
    const caller = await getPluginClient(authedContext("activator-3"), {
      auth: authStubFor(authedContext("activator-3")),
    } as never);
    await expect(caller.activateCommunity({ place: "atlantis" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

import { rmSync } from "node:fs";
import { Effect } from "effect";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";
import { discoveryActivities, discoveryProfiles, nodes, tenants } from "@/db/schema";
import pluginDevConfig from "../../plugin.dev";
import { type CaseActivity, eventVisibilityCases } from "../fixtures/event-visibility-cases";
import { getPluginClient, teardown } from "../setup";

const databaseDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "event-visibility-"));
  process.env.API_TEST_DATABASE_URL = `pglite:${dir}`;
  process.env.API_DATABASE_URL = `pglite:${dir}`;
  return dir;
});

const seeded = new Map<string, { nodeId: string; activityId: string }>();

function rebase(iso: string, shift: number) {
  return new Date(Date.parse(iso) + shift).toISOString();
}

async function seedCases() {
  const slug = pluginMigrationSlug(pluginDevConfig.pluginId);
  const schemaName = `plugin_${slug}`;
  const driver = await createDatabaseDriver(`pglite:${databaseDir}`, schemaName);
  try {
    const insertActivity = async (
      activity: CaseActivity,
      nodeId: string,
      shift: number,
      title: string,
    ) => {
      const id = crypto.randomUUID();
      const url = `https://example.com/visibility/${id}`;
      await driver.db.insert(discoveryActivities).values({
        id,
        ownerNodeId: nodeId,
        canonicalUrl: url,
        data: {
          id,
          ownerNodeId: nodeId,
          nodeIds: [nodeId],
          kind: activity.kind,
          title,
          summary: "",
          url,
          source: activity.luma ? "Luma" : "Community",
          publishedAt: rebase(activity.publishedAt, shift),
          startsAt: rebase(activity.startsAt, shift),
          endsAt: rebase(activity.endsAt, shift),
          timezone: "UTC",
          venue: "Online",
          status: activity.status,
          luma: activity.luma && {
            ...activity.luma,
            calendarId: "cal-visibility",
            eventId: `evt-${id}`,
            syncedAt: new Date().toISOString(),
          },
        },
      });
      return id;
    };
    const { migrations } = await Effect.runPromise(loadMigrations);
    await Effect.runPromise(migrate(driver.db, migrations, getMigrationStorage(slug), schemaName));
    for (const [
      index,
      { name, activity, earlierEvents, community, now },
    ] of eventVisibilityCases.entries()) {
      const shift = Date.now() - Date.parse(now);
      const [tenant] = await driver.db
        .insert(tenants)
        .values({
          name: `Visibility ${index}`,
          accountId: `visibility-${index}.near`,
          status: community.tenantActive ? "active" : "suspended",
        })
        .returning();
      const [node] = await driver.db
        .insert(nodes)
        .values({
          slug: `visibility-${index}`,
          name: `Visibility ${index}`,
          tenantId: tenant!.id,
          metadata: { kind: "city" },
        })
        .returning();
      await driver.db.insert(discoveryProfiles).values({
        nodeId: node!.id,
        data: {
          nodeId: node!.id,
          summary: "",
          location: "",
          region: "",
          latitude: null,
          longitude: null,
          channels: [],
          published: community.profilePublished,
        },
      });
      for (const [position, earlier] of (earlierEvents ?? []).entries()) {
        await insertActivity(earlier, node!.id, shift, `Visibility ${index} earlier ${position}`);
      }
      const id = await insertActivity(activity, node!.id, shift, `Visibility ${index}`);
      seeded.set(name, { nodeId: node!.id, activityId: id });
    }
  } finally {
    await driver.close();
  }
}

beforeAll(async () => {
  await seedCases();
}, 60_000);

afterAll(async () => {
  await teardown();
  rmSync(databaseDir, { recursive: true, force: true });
});

it.each(
  eventVisibilityCases,
)("$name matches the shared visibility contract", async (visibilityCase) => {
  const { nodeId, activityId } = seeded.get(visibilityCase.name)!;
  const publicClient = await getPluginClient();
  const page = await publicClient.getDiscoveryActivity({ id: activityId });
  expect(page?.id === activityId).toBe(visibilityCase.expected.onEventPage);
  const node = await publicClient.getDiscoveryNode({ nodeId });
  const explore = (await publicClient.listDiscovery({})).find((n) => n.nodeId === nodeId);
  const listed = (events?: { id: string }[]) => !!events?.some((e) => e.id === activityId);
  expect(listed(node?.events)).toBe(visibilityCase.expected.inLists);
  expect(listed(explore?.events)).toBe(visibilityCase.expected.inLists);
});

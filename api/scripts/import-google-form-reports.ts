// TODO(#512): delete after the Google Form backlog is imported.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { resolveDatabaseUrl, workspaceIdentityFromModuleUrl } from "everything-dev/db";
import { createDatabaseDriver } from "../src/db";
import { discoveryActivities, eventReports, memberDirectoryOptIns, nodes } from "../src/db/schema";
import {
  type ImportEventCandidate,
  importReportValues,
  parseCsv,
  planGoogleFormImport,
} from "../src/lib/import-google-form-reports";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

function usage(): never {
  console.error(`Usage:
  pnpm exec tsx scripts/import-google-form-reports.ts --csv <export.csv> --admin-user-id <userId> [--dry-run] [--accounts <map.json>]

CSV columns are matched by question text (event link, or community + event name + date, plus the in-app report questions). Unmatched rows are printed and not written.
`);
  process.exit(1);
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) usage();
  const csvPath = argValue(argv, "--csv");
  const adminUserId = argValue(argv, "--admin-user-id");
  const accountsPath = argValue(argv, "--accounts");
  const dryRun = argv.includes("--dry-run");
  if (!csvPath || !adminUserId) usage();

  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const accounts = new Map<string, string>();
  if (accountsPath) {
    const parsed = JSON.parse(await readFile(accountsPath, "utf8")) as Record<string, string>;
    for (const [key, value] of Object.entries(parsed)) {
      accounts.set(key.trim().toLowerCase(), value);
    }
  }

  const identity = workspaceIdentityFromModuleUrl(import.meta.url);
  const driver = await createDatabaseDriver(
    resolveDatabaseUrl(identity),
    `plugin_${identity.slug}`,
  );
  try {
    const directory = await driver.db
      .select({
        userId: memberDirectoryOptIns.userId,
        accountId: memberDirectoryOptIns.primaryAccountId,
      })
      .from(memberDirectoryOptIns);
    for (const row of directory) {
      if (row.accountId) accounts.set(row.accountId.trim().toLowerCase(), row.userId);
    }

    const activityRows = await driver.db
      .select({
        id: discoveryActivities.id,
        data: discoveryActivities.data,
        nodeId: nodes.id,
        nodeName: nodes.name,
      })
      .from(discoveryActivities)
      .innerJoin(nodes, eq(nodes.id, discoveryActivities.ownerNodeId));

    const events: ImportEventCandidate[] = activityRows
      .filter((row) => row.data.kind === "event")
      .map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        title: row.data.title,
        url: row.data.url,
        startsAt: row.data.startsAt ?? null,
        endsAt: row.data.endsAt ?? null,
        timezone: row.data.timezone ?? null,
      }));

    const existing = await driver.db
      .select({ activityId: eventReports.activityId })
      .from(eventReports);
    const existingActivityIds = new Set(existing.map((row) => row.activityId));

    const planned = planGoogleFormImport({
      rows,
      events,
      existingActivityIds,
      accounts,
      adminUserId,
    });

    const inserted =
      !dryRun && planned.matched.length > 0
        ? await driver.db
            .insert(eventReports)
            .values(planned.matched.map(importReportValues))
            .onConflictDoNothing({ target: eventReports.activityId })
            .returning({ activityId: eventReports.activityId })
        : [];
    const insertedIds = new Set(inserted.map((row) => row.activityId));

    console.log(
      JSON.stringify(
        {
          dryRun,
          imported: dryRun ? planned.matched.length : insertedIds.size,
          skippedExisting:
            planned.skippedExisting + (dryRun ? 0 : planned.matched.length - insertedIds.size),
          unmatched: planned.unmatched.map((row) => ({
            rowNumber: row.rowNumber,
            reason: row.reason,
            eventLink: row.values["Event link"] ?? row.values["Event URL"] ?? "",
            community: row.values.Community ?? row.values["Community name"] ?? "",
            eventName: row.values["Event name"] ?? "",
            eventDate: row.values["Event date"] ?? "",
          })),
          matched: planned.matched
            .filter((row) => dryRun || insertedIds.has(row.activityId))
            .map((row) => ({
              rowNumber: row.rowNumber,
              activityId: row.activityId,
              nodeId: row.nodeId,
              submittedBy: row.submittedBy,
            })),
        },
        null,
        2,
      ),
    );
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

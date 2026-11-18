import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../src/db/migrations");
const TARGET = "team-request-dismissal";

interface JournalEntry {
  idx: number;
  tag: string;
}

function loadJournal(): JournalEntry[] {
  const raw = readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8");
  return (JSON.parse(raw).entries as JournalEntry[]).sort((a, b) => a.idx - b.idx);
}

async function applyMigration(db: PGlite, entry: JournalEntry) {
  const statements = readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) {
    await db.exec(statement);
  }
}

describe("team request dismissal migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    const entries = loadJournal();
    const target = entries.findIndex((entry) => entry.tag.endsWith(`_${TARGET}`));
    expect(target).toBeGreaterThan(-1);
    for (const entry of entries.slice(0, target)) {
      await applyMigration(db, entry);
    }
    await db.exec(`
      INSERT INTO team_join_requests (id, organization_id, team_id, team_name, requester_user_id, status, decided_at)
      VALUES
        ('00000000-0000-4000-8000-000000000001', 'org-1', 'team-1', 'Events', 'user-1', 'approved', '2026-11-01T10:00:00Z'),
        ('00000000-0000-4000-8000-000000000002', 'org-1', 'team-2', 'Finance', 'user-1', 'declined', NULL),
        ('00000000-0000-4000-8000-000000000003', 'org-1', 'team-3', 'Stake', 'user-1', 'pending', NULL),
        ('00000000-0000-4000-8000-000000000004', 'org-1', 'team-4', 'Ops', 'user-1', 'withdrawn', NULL);
    `);
    await applyMigration(db, entries[target]!);
  }, 30_000);

  it("marks decisions made before the migration as already dismissed", async () => {
    const { rows } = await db.query<{ team_name: string; dismissed_at: Date | null }>(
      "SELECT team_name, dismissed_at FROM team_join_requests ORDER BY team_name",
    );
    const byTeam = Object.fromEntries(rows.map((row) => [row.team_name, row.dismissed_at]));
    expect(byTeam.Events?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(byTeam.Finance).toBeInstanceOf(Date);
    expect(byTeam.Stake).toBeNull();
    expect(byTeam.Ops).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  extractExpectedTables,
  getLegacyCandidates,
  getMigrationSlug,
  getMigrationStorage,
} from "../../src/db/migration-storage";

describe("getMigrationSlug", () => {
  it("returns api for the api workspace", () => {
    const slug = getMigrationSlug();
    expect(slug).toBe("api");
  });
});

describe("getMigrationStorage", () => {
  it("returns correct storage config for api", () => {
    const storage = getMigrationStorage();
    expect(storage.schema).toBe("drizzle");
    expect(storage.table).toBe("__drizzle_migrations_api");
    expect(storage.slug).toBe("api");
  });
});

describe("getLegacyCandidates", () => {
  it("returns legacy global and public tables", () => {
    const candidates = getLegacyCandidates();
    expect(candidates).toContainEqual({ schema: "drizzle", table: "__drizzle_migrations" });
    expect(candidates).toContainEqual({ schema: "public", table: "drizzle_migrations" });
  });
});

describe("extractExpectedTables", () => {
  it("extracts unqualified table names", () => {
    const migrations = [{ sql: ['CREATE TABLE IF NOT EXISTS "builders" (id text PRIMARY KEY)'] }];
    expect(extractExpectedTables(migrations)).toEqual(["builders"]);
  });

  it("extracts schema-qualified table names", () => {
    const migrations = [{ sql: ['CREATE TABLE "public"."things" (id text PRIMARY KEY)'] }];
    expect(extractExpectedTables(migrations)).toEqual(["public"]);
  });

  it("extracts multiple tables from multiple statements", () => {
    const migrations = [
      {
        sql: [
          'CREATE TABLE IF NOT EXISTS "users" (id text)',
          'CREATE TABLE IF NOT EXISTS "posts" (id text)',
        ],
      },
    ];
    const tables = extractExpectedTables(migrations);
    expect(tables).toContain("users");
    expect(tables).toContain("posts");
  });

  it("deduplicates table names", () => {
    const migrations = [
      { sql: ['CREATE TABLE "users" (id text)', 'CREATE INDEX ON "users" (name)'] },
    ];
    expect(extractExpectedTables(migrations)).toEqual(["users"]);
  });

  it("returns empty array when no CREATE TABLE", () => {
    const migrations = [{ sql: ["CREATE INDEX IF NOT EXISTS idx ON t (c)"] }];
    expect(extractExpectedTables(migrations)).toEqual([]);
  });
});

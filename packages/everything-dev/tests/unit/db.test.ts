import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractExpectedTables,
  getDatabaseUrlSecretName,
  getLegacyCandidates,
  getMigrationSlug,
  getMigrationStorage,
  pluginMigrationSlug,
} from "../../src/db";

describe("getMigrationSlug", () => {
  it("falls back to npm_package_name when no dir given", () => {
    const prev = process.env.npm_package_name;
    process.env.npm_package_name = "@everything-dev/test-plugin";
    try {
      expect(getMigrationSlug()).toBe("test");
    } finally {
      process.env.npm_package_name = prev;
    }
  });
});

describe("getMigrationStorage", () => {
  it("returns correct storage config", () => {
    const prev = process.env.npm_package_name;
    process.env.npm_package_name = "api";
    try {
      const storage = getMigrationStorage();
      expect(storage.schema).toBe("drizzle");
      expect(storage.table).toBe("__drizzle_migrations_api");
      expect(storage.slug).toBe("api");
    } finally {
      process.env.npm_package_name = prev;
    }
  });

  it("derives from a workspace directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "everything-dev-db-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify({ name: "@everything-dev/foo-plugin" })}\n`,
      );
      const storage = getMigrationStorage(dir);
      expect(storage.slug).toBe("foo");
      expect(storage.table).toBe("__drizzle_migrations_foo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    expect(
      extractExpectedTables([{ sql: ['CREATE TABLE IF NOT EXISTS "builders" (...)'] }]),
    ).toEqual(["builders"]);
  });

  it("extracts schema-qualified table names", () => {
    expect(extractExpectedTables([{ sql: ['CREATE TABLE "public"."things" (...)'] }])).toEqual([
      "things",
    ]);
  });

  it("returns empty array when no CREATE TABLE", () => {
    expect(extractExpectedTables([{ sql: ["CREATE INDEX idx ON t (c)"] }])).toEqual([]);
  });
});

describe("pluginMigrationSlug", () => {
  it("normalizes plugin keys", () => {
    expect(pluginMigrationSlug("@everything-dev/builders-plugin")).toBe("builders");
    expect(pluginMigrationSlug("api")).toBe("api");
    expect(pluginMigrationSlug("my-app")).toBe("my_app");
  });
});

describe("getDatabaseUrlSecretName", () => {
  it("returns correct secret names", () => {
    expect(getDatabaseUrlSecretName("builders")).toBe("BUILDERS_DATABASE_URL");
    expect(getDatabaseUrlSecretName("api")).toBe("API_DATABASE_URL");
    expect(getDatabaseUrlSecretName("my_plugin")).toBe("MY_PLUGIN_DATABASE_URL");
  });
});

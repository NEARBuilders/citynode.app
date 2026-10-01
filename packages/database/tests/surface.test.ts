import { advisoryLockKey, createDatabase } from "@near-intents-agent-api/database";
import { agents, apiKeys, tenants, user } from "@near-intents-agent-api/database/schema";
import { createTestDatabase } from "@near-intents-agent-api/database/testing";
import { describe, expect, it } from "vitest";

describe("vendored database surface", () => {
  it("derives a stable advisory-lock key per name", () => {
    expect(advisoryLockKey("agents/x")).toBe(advisoryLockKey("agents/x"));
    expect(advisoryLockKey("agents/x")).not.toBe(advisoryLockKey("agents/y"));
  });

  it("boots an in-memory database with migrations applied and writes a tenant row", async () => {
    const handle = await createTestDatabase();
    try {
      await handle.db
        .insert(user)
        .values({ id: "u1", name: "Test User", email: "u@citynode.app" })
        .returning();
      await handle.db.insert(tenants).values({ id: "t1", ownerUserId: "u1" }).returning();
      const inserted = await handle.db
        .insert(apiKeys)
        .values({
          id: "k1",
          tenantId: "t1",
          name: "test key",
          tokenHash: "0".repeat(64),
          prefix: "naa_test",
          expiresAt: new Date(),
        })
        .returning();
      expect(inserted[0]?.id).toBe("k1");
      expect(agents).toBeDefined();
    } finally {
      handle.close();
    }
  });

  it("createDatabase is the production entry point", () => {
    expect(typeof createDatabase).toBe("function");
  });
});

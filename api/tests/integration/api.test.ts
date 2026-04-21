import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPluginClient, teardown } from "../setup";

describe("API Integration", () => {
  afterAll(async () => {
    await teardown();
  });

  describe("ping", () => {
    it("returns ok status", async () => {
      const client = await getPluginClient();

      const result = await client.ping();

      expect(result.status).toBe("ok");
      expect(result.timestamp).toBeDefined();
    });
  });
});

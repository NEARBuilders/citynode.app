import {
  configureDatabase,
  configureRuntime,
  getDatabase,
  getRuntime,
  requiredSlot,
} from "@near-intents-agent-api/agents-core";
import { describe, expect, it } from "vitest";

describe("agents-core dependency slots", () => {
  it("requiredSlot fails closed before configuration and returns the value after", () => {
    const slot = requiredSlot<{ marker: string }>("Test slot");
    expect(() => slot.get()).toThrow("Test slot is not configured");
    slot.set({ marker: "configured" });
    expect(slot.get().marker).toBe("configured");
    slot.set(undefined);
    expect(() => slot.get()).toThrow("Test slot is not configured");
  });

  it("runtime slot round-trips a configured AppRuntime", () => {
    configureRuntime({
      trustedOrigins: ["https://citynode.app"],
      nearRpcUrls: ["https://near.drpc.org"],
      network: "mainnet",
      serviceUrl: "https://citynode.app",
      sponsorDailyGlobalLimit: 100,
      sponsorDailyTenantLimit: 20,
      sponsorDailyAgentLimit: 10,
      logLevel: "warn",
    } as Parameters<typeof configureRuntime>[0]);
    const runtime = getRuntime();
    expect(runtime.trustedOrigins).toEqual(["https://citynode.app"]);
    expect(runtime.network).toBe("mainnet");
    expect(runtime.sponsorDailyGlobalLimit).toBe(100);
  });

  it("database slot surfaces the configured handle", () => {
    const handle = { db: { marker: "db" } } as unknown as Parameters<typeof configureDatabase>[0];
    configureDatabase(handle);
    expect(getDatabase()).toBeDefined();
  });
});

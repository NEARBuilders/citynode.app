import type { PluginConfigInput } from "every-plugin";
import type Plugin from "@/index";

export const TEST_PLUGIN_ID = "api";

export type TestPluginConfig = PluginConfigInput<typeof Plugin>;

const baseVariables = {
  platformAccount: "audit.citynode.near",
  gatewayDomains: "citynode.app,testnet.citynode.app",
};

const baseSecrets = () => ({
  LUMA_CALENDAR_API_KEYS: process.env.LUMA_CALENDAR_API_KEYS || "",
  API_DATABASE_URL: process.env.API_DATABASE_URL || "pglite:.bos/api/:memory:",
});

let overrides: Partial<TestPluginConfig> = {};

export function setTestConfigOverrides(next: Partial<TestPluginConfig>): void {
  overrides = next;
}

export function buildTestConfig(): TestPluginConfig {
  return {
    variables: { ...baseVariables, ...overrides.variables },
    secrets: { ...baseSecrets(), ...overrides.secrets },
  } satisfies TestPluginConfig;
}

import "dotenv/config";
import type { PluginConfigInput } from "every-plugin";
import packageJson from "./package.json" with { type: "json" };
import type Plugin from "./src/index";

export default {
  pluginId: packageJson.name,
  port: Number(process.env.PORT) || 3016,
  config: {
    variables: {
      agentsNearRpcUrls:
        process.env.AGENTS_NEAR_RPC_URLS || "https://near.drpc.org,https://free.rpc.fastnear.com",
      agentsTrustedOrigins: process.env.AGENTS_TRUSTED_ORIGINS || "https://citynode.app",
      agentsServiceUrl: process.env.AGENTS_SERVICE_URL || "https://agents.local",
      agentsSponsorDailyGlobalLimit: Number(process.env.AGENTS_SPONSOR_DAILY_GLOBAL_LIMIT) || 100,
      agentsSponsorDailyTenantLimit: Number(process.env.AGENTS_SPONSOR_DAILY_TENANT_LIMIT) || 20,
      agentsSponsorDailyAgentLimit: Number(process.env.AGENTS_SPONSOR_DAILY_AGENT_LIMIT) || 10,
    },
    secrets: {
      AGENTS_DATABASE_URL: process.env.AGENTS_DATABASE_URL || "pglite:.bos/agents/:memory:",
      ...(process.env.AGENTS_SPONSOR_KEYS
        ? { AGENTS_SPONSOR_KEYS: process.env.AGENTS_SPONSOR_KEYS }
        : {}),
      ...(process.env.AGENTS_SECRET_ENCRYPTION_KEYS
        ? { AGENTS_SECRET_ENCRYPTION_KEYS: process.env.AGENTS_SECRET_ENCRYPTION_KEYS }
        : {}),
      ...(process.env.AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID
        ? {
            AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID:
              process.env.AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID,
          }
        : {}),
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};

import "dotenv/config";
import type { PluginConfigInput } from "every-plugin";
import type Plugin from "./api/src/index";
import packageJson from "./package.json" with { type: "json" };

export default {
  pluginId: packageJson.name,
  port: Number(process.env.PORT) || 3013,
  config: {
    variables: {
      privatePluginIds: ["nearcatalog"],
    },
    secrets: {
      PROPOSALS_DATABASE_URL:
        process.env.PROPOSALS_DATABASE_URL || "pglite:.bos/proposals/:memory:",
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};

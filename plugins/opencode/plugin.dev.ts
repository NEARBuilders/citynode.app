import "dotenv/config";
import type { PluginConfigInput } from "every-plugin";
import packageJson from "./package.json" with { type: "json" };
import type Plugin from "./src/index";

export default {
  pluginId: packageJson.name,
  port: Number(process.env.PORT) || 3010,
  config: {
    variables: {
      opencodePort: 4096,
      opencodeHost: "localhost",
    },
    secrets: {
      OPENCODE_API_KEY: process.env.OPENCODE_API_KEY || "",
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};

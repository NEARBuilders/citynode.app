import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmitPluginManifest,
  EveryPluginDevServer,
  FixMfDataUriPlugin,
} from "every-plugin/build/rspack";
import { computeSriHashForUrl } from "everything-dev/integrity";
import { withZephyr } from "zephyr-rspack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shouldDeploy = process.env.DEPLOY === "true";

function normalizePath(input: string) {
  return input.replace(/\\/g, "/").replace(/\/+$/, "");
}

function resolveLocalTarget(value: unknown, configRoot: string): string | null {
  if (typeof value !== "string" || !value.startsWith("local:")) {
    return null;
  }

  return normalizePath(path.resolve(configRoot, value.slice("local:".length)));
}

function updateBosConfig(url: string, integrity: string | undefined) {
  try {
    const configPath = path.resolve(__dirname, "../../bos.config.json");
    const configRoot = path.dirname(configPath);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (config.app?.auth) {
      config.app.auth.production = url;
      if (integrity) {
        config.app.auth.integrity = integrity;
      } else {
        delete config.app.auth.integrity;
      }
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      console.log(`   ✅ Updated bos.config.json: auth.production`);
      if (integrity) {
        console.log(`   ✅ Updated bos.config.json: auth.integrity`);
      }
    }
  } catch (err) {
    console.error("   ❌ Failed to update bos.config.json:", (err as Error).message);
  }
}

const baseConfig = {
  plugins: [
    new EmitPluginManifest({
      additionalExports: [
        {
          srcPath: "types/auth-export.d.ts",
          exportNames: ["Auth", "AuthSession", "createAuthInstance"],
        },
      ],
    }),
    new EveryPluginDevServer({ dts: false }),
    new FixMfDataUriPlugin(),
  ],
  infrastructureLogging: {
    level: "error",
  },
  stats: "errors-warnings",
};

export default shouldDeploy
  ? withZephyr({
      hooks: {
        onDeployComplete: async (info: { url: string }) => {
          console.log("🚀 Auth Plugin Deployed:", info.url);
          const integrity = await computeSriHashForUrl(info.url);
          updateBosConfig(info.url, integrity ?? undefined);
        },
      },
    })(baseConfig)
  : baseConfig;

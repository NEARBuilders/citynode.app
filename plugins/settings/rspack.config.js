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

const localConfigPath = path.resolve(__dirname, "bos.config.json");

function updateLocalConfigSection(section, url, integrity) {
  try {
    const config = JSON.parse(fs.readFileSync(localConfigPath, "utf8"));
    if (!config.app) config.app = {};
    if (!config.app[section]) config.app[section] = {};
    config.app[section].production = url;
    if (integrity) {
      config.app[section].integrity = integrity;
    } else {
      delete config.app[section].integrity;
    }
    fs.writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated local bos.config.json: app.${section}.production`);
    if (integrity) {
      console.log(`   ✅ Updated local bos.config.json: app.${section}.integrity`);
    }
  } catch (err) {
    console.error("   ❌ Failed to update local bos.config.json:", err.message);
  }
}

const baseConfig = {
  devtool: shouldDeploy ? false : "source-map",
  plugins: [
    new EmitPluginManifest(),
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
        onDeployComplete: async (info) => {
          console.log("🚀 Settings Plugin Deployed:", info.url);
          const integrity = await computeSriHashForUrl(info.url);
          updateLocalConfigSection("api", info.url, integrity ?? undefined);
        },
      },
    })(baseConfig)
  : baseConfig;

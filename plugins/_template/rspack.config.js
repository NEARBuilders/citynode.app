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
const rootConfigPath = path.resolve(__dirname, "../../bos.config.json");

function normalizePath(input) {
  return input.replace(/\\/g, "/").replace(/\/+$/, "");
}

function resolveLocalTarget(value, configRoot) {
  if (typeof value !== "string" || !value.startsWith("local:")) {
    return null;
  }

  return normalizePath(path.resolve(configRoot, value.slice("local:".length)));
}

function updateLocalConfig(url, integrity) {
  try {
    const config = JSON.parse(fs.readFileSync(localConfigPath, "utf8"));
    if (!config.app?.api) config.app = config.app ?? {};
    config.app.api = config.app.api ?? {};
    config.app.api.production = url;
    if (integrity) {
      config.app.api.integrity = integrity;
    } else {
      delete config.app.api.integrity;
    }
    fs.writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log("   ✅ Updated local bos.config.json: app.api.production");
    if (integrity) {
      console.log("   ✅ Updated local bos.config.json: app.api.integrity");
    }
  } catch (err) {
    console.error("   ❌ Failed to update local bos.config.json:", err.message);
  }
}

function updateRootConfig(url, integrity) {
  try {
    const configRoot = path.dirname(rootConfigPath);
    const config = JSON.parse(fs.readFileSync(rootConfigPath, "utf8"));
    const pluginDir = normalizePath(__dirname);

    const match = Object.entries(config.plugins ?? {}).find(([, plugin]) => {
      return resolveLocalTarget(plugin.development, configRoot) === pluginDir;
    });

    if (!match) {
      console.warn(`   ⚠️  No matching plugin entry in root config for ${pluginDir}`);
      return;
    }

    const [key] = match;
    config.plugins[key].production = url;
    if (integrity) {
      config.plugins[key].integrity = integrity;
    } else {
      delete config.plugins[key].integrity;
    }
    fs.writeFileSync(rootConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated root bos.config.json: plugins.${key}.production`);
    if (integrity) {
      console.log(`   ✅ Updated root bos.config.json: plugins.${key}.integrity`);
    }
  } catch (err) {
    console.error("   ❌ Failed to update root bos.config.json:", err.message);
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
          console.log("🚀 Template Plugin Deployed:", info.url);
          const integrity = await computeSriHashForUrl(info.url);
          updateLocalConfig(info.url, integrity ?? undefined);
          updateRootConfig(info.url, integrity ?? undefined);
        },
      },
    })(baseConfig)
  : baseConfig;

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

const resolvedConfigPath = path.resolve(__dirname, "../../.bos/bos.resolved-config.json");
const bosConfigPath = path.resolve(__dirname, "../../bos.config.json");

function readBosConfig() {
  const configPath = fs.existsSync(resolvedConfigPath) ? resolvedConfigPath : bosConfigPath;
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (raw._resolved) {
    const { _resolved, ...data } = raw;
    return data;
  }
  return raw;
}

const bosConfig = readBosConfig();

function normalizePath(input) {
  return input.replace(/\\/g, "/").replace(/\/+$/, "");
}

function resolveLocalTarget(value, configRoot) {
  if (typeof value !== "string" || !value.startsWith("local:")) {
    return null;
  }

  return normalizePath(path.resolve(configRoot, value.slice("local:".length)));
}

function updateBosConfig(url, integrity) {
  try {
    const configRoot = path.dirname(bosConfigPath);
    const config = JSON.parse(fs.readFileSync(bosConfigPath, "utf8"));
    const pluginDir = normalizePath(__dirname);

    const match = Object.entries(config.plugins ?? {}).find(([, plugin]) => {
      return resolveLocalTarget(plugin.development, configRoot) === pluginDir;
    });

    if (!match) {
      console.warn(`   ⚠️  No matching plugin entry found for ${pluginDir}`);
      return;
    }

    const [key] = match;
    config.plugins[key].production = url;
    if (integrity) {
      config.plugins[key].integrity = integrity;
    } else {
      delete config.plugins[key].integrity;
    }
    fs.writeFileSync(bosConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated bos.config.json: plugins.${key}.production`);
    if (integrity) {
      console.log(`   ✅ Updated bos.config.json: plugins.${key}.integrity`);
    }
  } catch (err) {
    console.error("   ❌ Failed to update bos.config.json:", err.message);
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
          updateBosConfig(info.url, integrity ?? undefined);
        },
      },
    })(baseConfig)
  : baseConfig;

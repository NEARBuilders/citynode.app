import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { computeSriHashForUrl } from "everything-dev/integrity";
import { withZephyr } from "zephyr-rsbuild-plugin";

const require = createRequire(import.meta.url);

const __dirname = import.meta.dirname;
const shouldDeploy = process.env.DEPLOY === "true";

const resolvedConfigPath = path.resolve(__dirname, "../.bos/bos.resolved-config.json");
const rootBosConfigPath = path.resolve(__dirname, "../bos.config.json");
const configPath =
  process.env.BOS_CONFIG_PATH ??
  (fs.existsSync(resolvedConfigPath)
    ? resolvedConfigPath
    : rootBosConfigPath);

const bosConfigRaw = JSON.parse(fs.readFileSync(configPath, "utf8"));
const bosConfig = bosConfigRaw._resolved
  ? (() => {
      const { _resolved, ...data } = bosConfigRaw;
      return data;
    })()
  : bosConfigRaw;
const sharedUi = bosConfig.shared?.ui ?? {};
const sharedPlugins = bosConfig.shared?.plugins ?? {};

let pluginPkg: {
  version: string;
  peerDependencies: {
    effect: string;
    zod: string;
    "@orpc/contract": string;
    "@orpc/server": string;
  };
};
try {
  pluginPkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../packages/every-plugin/package.json"), "utf8"),
  );
} catch {
  pluginPkg = require("every-plugin/package.json") as typeof pluginPkg;
}

function getInstalledVersion(pkg: string, fallback: string): string {
  try {
    return require(`${pkg}/package.json`).version as string;
  } catch {
    const match = fallback.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
    return match ? match[0] : fallback.replace(/^[\^~>=<\s]+/, "");
  }
}

const SHARE_DEFAULTS = {
  requiredVersion: false,
  singleton: true,
  strictVersion: false,
  eager: false,
};

const pluginShared = {
  "every-plugin": { version: pluginPkg.version, ...SHARE_DEFAULTS },
  effect: {
    version: getInstalledVersion("effect", pluginPkg.peerDependencies.effect),
    ...SHARE_DEFAULTS,
  },
  zod: { version: getInstalledVersion("zod", pluginPkg.peerDependencies.zod), ...SHARE_DEFAULTS },
  "@orpc/contract": {
    version: getInstalledVersion("@orpc/contract", pluginPkg.peerDependencies["@orpc/contract"]),
    ...SHARE_DEFAULTS,
  },
  "@orpc/server": {
    version: getInstalledVersion("@orpc/server", pluginPkg.peerDependencies["@orpc/server"]),
    ...SHARE_DEFAULTS,
  },
};
const shared = { ...pluginShared, ...sharedUi, ...sharedPlugins };

function updateBosConfig(url: string, integrity?: string) {
  try {
    const config = JSON.parse(fs.readFileSync(rootBosConfigPath, "utf8"));
    config.app.host.production = url;
    if (integrity) {
      config.app.host.integrity = integrity;
    } else {
      delete config.app.host.integrity;
    }
    fs.writeFileSync(rootBosConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated bos.config.json: app.host.production`);
    if (integrity) {
      console.log(`   ✅ Updated bos.config.json: app.host.integrity`);
    }
  } catch (err) {
    console.error("   ❌ Failed to update bos.config.json:", (err as Error).message);
  }
}

const plugins = [pluginReact()];

if (shouldDeploy) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: async (info: { url: string }) => {
          console.log("🚀 Host Deployed:", info.url);
          const integrity = await computeSriHashForUrl(info.url);
          updateBosConfig(info.url, integrity ?? undefined);
        },
      },
    }),
  );
}

export default defineConfig({
  plugins,
  source: {
    entry: {
      index: "./src/program.ts",
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  dev: {
    progressBar: false,
  },
  tools: {
    rspack: {
      target: "async-node",
      optimization: {
        nodeEnv: false,
      },
      output: {
        uniqueName: "host",
        library: { type: "commonjs-module" },
      },
      externals: [/^node:/, /^bun:/],
      resolve: {
        fallback: { bufferutil: false, "utf-8-validate": false },
      },
      infrastructureLogging: {
        level: "error",
      },
      stats: "errors-warnings",
      plugins: [
        new ModuleFederationPlugin({
          name: "host",
          filename: "remoteEntry.js",
          dts: false,
          runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
          library: { type: "commonjs-module" },
          exposes: {
            "./Server": "./src/program.ts",
          },
          shared,
        }),
      ],
    },
  },
  output: {
    minify: false,
    distPath: {
      root: "dist",
    },
    assetPrefix: "/",
    filename: {
      js: "[name].js",
    },
  },
});

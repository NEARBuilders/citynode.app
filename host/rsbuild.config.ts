import fs from "node:fs";
import path from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import DrizzleORMMigrations from "@proj-airi/unplugin-drizzle-orm-migrations/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { computeSriHashForUrl } from "everything-dev/integrity";
import { withZephyr } from "zephyr-rsbuild-plugin";

const __dirname = import.meta.dirname;
const shouldDeploy = process.env.DEPLOY === "true";

const configPath = process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, "../bos.config.json");

const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sharedUi = bosConfig.shared?.ui ?? {};

function updateBosConfig(url: string, integrity?: string) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.app.host.production = url;
    if (integrity) {
      config.app.host.integrity = integrity;
    } else {
      delete config.app.host.integrity;
    }
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
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
      externals: [/^node:/, /^bun:/, "@libsql/client"],
      resolve: {
        fallback: { bufferutil: false, "utf-8-validate": false },
      },
      infrastructureLogging: {
        level: "error",
      },
      stats: "errors-warnings",
      plugins: [
        DrizzleORMMigrations(),
        new ModuleFederationPlugin({
          name: "host",
          filename: "remoteEntry.js",
          dts: false,
          runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
          library: { type: "commonjs-module" },
          exposes: {
            "./Server": "./src/program.ts",
          },
          shared: sharedUi,
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

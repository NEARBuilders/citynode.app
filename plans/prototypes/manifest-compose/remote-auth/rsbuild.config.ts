import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

// Dual-environment MF remote (web = browser chunks, node = SSR bundle),
// the proven PR #134 shape: the node recipe activates via the plugin's
// `{ target: "node" }` second argument, emitting dist/ssr/remoteEntry.server.js
// (CJS container, async-node chunk loading).
export default defineConfig({
  environments: {
    web: {
      plugins: [
        pluginReact(),
        pluginModuleFederation({
          name: "auth",
          exposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
          shared: {
            react: { singleton: true, requiredVersion: false, eager: true },
            "react-dom": { singleton: true, requiredVersion: false, eager: true },
            "@tanstack/react-router": { singleton: true, requiredVersion: false, eager: true },
          },
        }),
      ],
      output: { crossOriginLoading: "anonymous" },
    },
    node: {
      plugins: [
        pluginReact(),
        pluginModuleFederation(
          {
            name: "auth",
            exposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
            shared: {
              react: { singleton: true, requiredVersion: false },
              "react-dom": { singleton: true, requiredVersion: false },
              "@tanstack/react-router": { singleton: true, requiredVersion: false },
            },
            filename: "remoteEntry.server.js",
          },
          { target: "node", environment: "node" },
        ),
      ],
      source: { entry: { index: "./src/routeConfig.gen.ts" } },
      output: {
        target: "node",
        distPath: { root: "dist/ssr" },
        filename: { js: "[name].js" },
      },
    },
  },
  dev: { progressBar: false },
});

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
          name: "landingTenant",
          exposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
          shared: {
            react: { version: "19.2.4", requiredVersion: "19.2.4", singleton: true, strictVersion: true, eager: false, shareScope: "default" },
            "react-dom": { version: "19.2.4", requiredVersion: "19.2.4", singleton: true, strictVersion: true, eager: false, shareScope: "default" },
            "@tanstack/react-router": { version: "1.170.32", requiredVersion: "1.170.32", singleton: true, strictVersion: true, eager: false, shareScope: "default" },
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
            name: "landingTenant",
            exposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
            shared: {
              react: { version: "19.2.4", requiredVersion: "19.2.4", singleton: true, strictVersion: true, eager: false, import: false, shareScope: "default" },
              "react-dom": { version: "19.2.4", requiredVersion: "19.2.4", singleton: true, strictVersion: true, eager: false, import: false, shareScope: "default" },
              "@tanstack/react-router": { version: "1.170.32", requiredVersion: "1.170.32", singleton: true, strictVersion: true, eager: false, import: false, shareScope: "default" },
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

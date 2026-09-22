/**
 * Environments-based Module Federation config for the auth ui plugin remote —
 * built from the shared factory (ADR 0008 §7): `web` emits the client remote
 * and `node` the SSR container, both exposing `./routeConfig` (the generated
 * import map — per-route option bundles for host construction).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUiRsbuildConfig, pluginUiDeployFields } from "everything-dev/ui/mf-build";
import pkg from "./package.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createUiRsbuildConfig({
  workspaceRoot: __dirname,
  pkg,
  role: "consumer",
  manifestName: "auth",
  configDir: path.resolve(__dirname, "../../.."),
  deployFields: pluginUiDeployFields("auth"),
  deployLabel: "Auth UI",
  devPort: 3010,
  webEntry: "./src/routeConfig.gen.ts",
  webExposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
  nodeEntry: "./src/routeConfig.gen.ts",
  nodeExposes: { "./routeConfig": "./src/routeConfig.gen.ts" },
});

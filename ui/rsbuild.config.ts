/**
 * Rsbuild environments-based config for the core UI remote — built from the
 * shared factory (ADR 0008 §7): `web` emits the client remote (async-boundary
 * entry → hydrate composes from the runtime-config payload); `node` emits the
 * SSR container exposing `./Router` (SSR render), `./compose` (the
 * construction engine, executing in this module graph), and `./routeConfig`
 * (the core's generated import map).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORE_UI_DEPLOY_FIELDS,
  CORE_UI_PLUGIN_KEY,
  createUiRsbuildConfig,
} from "everything-dev/ui/mf-build";
import pkg from "./package.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = __dirname;
const repoRoot = path.resolve(__dirname, "..");

const resolvedConfigPath = path.resolve(repoRoot, ".bos/bos.resolved-config.json");
const bosConfig = fs.existsSync(resolvedConfigPath)
  ? (() => {
      const raw = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8"));
      const { _resolved, ...data } = raw;
      return data as { domain: string; account: string };
    })()
  : (JSON.parse(fs.readFileSync(path.resolve(repoRoot, "bos.config.json"), "utf8")) as {
      domain: string;
      account: string;
    });

export default createUiRsbuildConfig({
  workspaceRoot,
  pkg,
  role: "provider",
  manifestName: CORE_UI_PLUGIN_KEY,
  configDir: repoRoot,
  deployFields: CORE_UI_DEPLOY_FIELDS,
  deployLabel: "UI",
  devPort: 3003,
  webEntry: "./src/entry.ts",
  webExposes: {
    "./Hydrate": "./src/hydrate.tsx",
    "./components": "./src/components/index.ts",
    "./providers": "./src/providers/index.tsx",
    "./hooks": "./src/hooks/index.ts",
  },
  nodeEntry: "./src/router.server.tsx",
  nodeExposes: {
    "./Router": "./src/router.server.tsx",
    "./compose": "./src/compose.ts",
    "./routeConfig": "./src/routeConfig.gen.ts",
  },
  copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
  define: {
    "import.meta.env.APP_NAME": JSON.stringify(bosConfig.domain),
    "import.meta.env.APP_ACCOUNT": JSON.stringify(bosConfig.account),
  },
});

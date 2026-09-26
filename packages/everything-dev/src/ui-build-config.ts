/**
 * Core-UI rsbuild config synthesis — the every-plugin generated-config model:
 * when the ui workspace has no local `rsbuild.config.ts`, `bos dev`/`bos
 * build` (through the `bos-ui` runner) generate one from the shared factory
 * so the build contract is the framework's, not per-scaffold config. A local
 * rsbuild.config.ts is honored as an override, untouched.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const GENERATED_CONFIG_DIR = ".bos";
const GENERATED_UI_CONFIG = "ui.rsbuild.config.generated.mjs";

function generatedCoreUiConfig(): string {
  return `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_UI_PLUGIN_KEY, createUiRsbuildConfig } from "every-plugin/ui/mf-build";

const generatedDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(generatedDir, "..");
const workspaceRoot = path.resolve(repoRoot, "ui");
const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8"));

const resolvedConfigPath = path.join(repoRoot, ".bos", "bos.resolved-config.json");
const bosConfig = fs.existsSync(resolvedConfigPath)
  ? (() => {
      const raw = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8"));
      const { _resolved, ...data } = raw;
      return data;
    })()
  : JSON.parse(fs.readFileSync(path.join(repoRoot, "bos.config.json"), "utf8"));

export default createUiRsbuildConfig({
  workspaceRoot,
  pkg,
  role: "provider",
  manifestName: CORE_UI_PLUGIN_KEY,
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
  copy: [{ from: path.join(workspaceRoot, "public"), to: "./" }],
  define: {
    "import.meta.env.APP_NAME": JSON.stringify(bosConfig.domain),
    "import.meta.env.APP_ACCOUNT": JSON.stringify(bosConfig.account),
  },
});
`;
}

export function resolveRsbuildConfig(workspaceRoot: string): string | null {
  const localConfig = join(workspaceRoot, "rsbuild.config.ts");
  if (existsSync(localConfig)) return localConfig;

  const repoRoot = resolve(workspaceRoot, "..");
  const outDir = join(repoRoot, GENERATED_CONFIG_DIR);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, GENERATED_UI_CONFIG);
  writeFileSync(outPath, generatedCoreUiConfig());
  return outPath;
}

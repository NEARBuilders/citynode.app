import fs from "node:fs";
import path from "node:path";
import { findBosConfigPath } from "../build/rspack/compose";
import { getPluginInfo } from "../build/rspack/utils";

const UI_DIR = "ui";
const GENERATED_CONFIG_DIR = ".every-plugin";
const GENERATED_UI_CONFIG = "ui.rsbuild.config.generated.mjs";

/**
 * Folder-form UI source: a `ui/` directory with route files but no own
 * package.json — the plugin workspace owns the build (single-workspace
 * plugin, one dev process, one deploy train). Workspace-form ui sources
 * (own package.json + scripts) are NOT managed here.
 */
export function hasFolderFormUi(cwd: string): boolean {
  const uiDir = path.join(cwd, UI_DIR);
  return (
    fs.existsSync(path.join(uiDir, "src", "routes")) &&
    !fs.existsSync(path.join(uiDir, "package.json"))
  );
}

function generatedUiConfig(pluginId: string, bosConfigPath: string | null): string {
  const bosConfigDir = bosConfigPath ? path.dirname(bosConfigPath) : null;
  return `import path from "node:path";
import { createUiRsbuildConfig, pluginUiDeployFields } from "every-plugin/ui/mf-build";
import { uiDeployPlugins } from "everything-dev/ui/deploy";
import pkg from "../package.json";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "ui");
const bosConfigDir = ${JSON.stringify(bosConfigDir)};

export default createUiRsbuildConfig({
  workspaceRoot,
  pkg,
  role: "consumer",
  manifestName: ${JSON.stringify(pluginId)},
  configDir: bosConfigDir ?? process.cwd(),
  deployFields: pluginUiDeployFields(${JSON.stringify(pluginId)}),
  deployLabel: ${JSON.stringify(`${pluginId} UI`)},
  devPort: Number(process.env.BOS_UI_PORT) || 0,
  webEntry: "./ui/src/routeConfig.gen.ts",
  webExposes: { "./routeConfig": "./ui/src/routeConfig.gen.ts" },
  nodeEntry: "./ui/src/routeConfig.gen.ts",
  nodeExposes: { "./routeConfig": "./ui/src/routeConfig.gen.ts" },
  routesDirectory: "./ui/src/routes",
  deployPlugins: uiDeployPlugins,
});
`;
}

/**
 * Synthesize the rsbuild config for a folder-form ui source (the plugin
 * build contract, not per-plugin config — mirrors the rspack generated
 * config). Returns the config file path, or null when the workspace has no
 * folder-form ui source.
 */
export function ensureGeneratedUiRsbuildConfig(cwd: string): string | null {
  if (!hasFolderFormUi(cwd)) return null;
  const bosConfigPath = findBosConfigPath(cwd);
  const outDir = path.join(cwd, GENERATED_CONFIG_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, GENERATED_UI_CONFIG);
  // Canonical plugin key: the config-layout id (plugins/<id>) — the same key
  // the runtime config and composition use. plugin.dev.ts's pluginId is the
  // npm name, which does not match the composition keying.
  const layoutKey =
    bosConfigPath && path.relative(path.dirname(bosConfigPath), cwd).startsWith("plugins/")
      ? path.relative(path.dirname(bosConfigPath), cwd).split(path.sep)[1]?.split(path.sep)[0]
      : undefined;
  const pluginId = layoutKey ?? getPluginInfo(cwd).normalizedName;
  const next = generatedUiConfig(pluginId, bosConfigPath);
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== next) {
    fs.writeFileSync(outPath, next);
  }
  return outPath;
}

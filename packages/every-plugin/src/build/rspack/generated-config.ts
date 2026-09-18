import fs from "node:fs";
import path from "node:path";

export function findBosConfigPathSync(from: string = process.cwd()): string | null {
  let current = path.resolve(from);
  for (;;) {
    const candidate = path.join(current, "bos.config.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function pluginDisplayName(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(cwd, "package.json"), "utf8"));
    return pkg.name ?? "Plugin";
  } catch {
    return "Plugin";
  }
}

function generatedRspackConfig(
  deployLabel: string,
  hasOverrides: boolean,
  bosConfigPath: string | null,
): string {
  return `import { createPluginBaseConfig } from "every-plugin/build/rspack";
import { withPluginDeploy } from "everything-dev/integrity";
${hasOverrides ? `import buildOverrides from "../build.config.ts";\n` : ""}
const config = createPluginBaseConfig(${hasOverrides ? "buildOverrides" : "{}"});
const bosConfigPath = ${JSON.stringify(bosConfigPath)};
export default bosConfigPath
  ? withPluginDeploy(config, { bosConfigPath, deployLabel: ${JSON.stringify(deployLabel)} })
  : config;
`;
}

/**
 * Ensures the synthesized rspack config exists for workspaces that no longer
 * ship their own `rspack.config.js`. Returns the workspace-relative config
 * path to pass via `--config`, or `null` when the workspace has its own
 * `rspack.config.js` and bare `rspack build` should be used.
 */
export function ensureGeneratedRspackConfig(cwd: string = process.cwd()): string | null {
  if (fs.existsSync(path.join(cwd, "rspack.config.js"))) return null;

  const bosConfigPath = findBosConfigPathSync(cwd);
  const overridesPath = path.resolve(cwd, "build.config.ts");
  const hasOverrides = fs.existsSync(overridesPath);
  const generatedDir = path.join(cwd, ".every-plugin");
  const generatedConfig = path.join(generatedDir, "rspack.config.generated.mjs");
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    generatedConfig,
    generatedRspackConfig(pluginDisplayName(cwd), hasOverrides, bosConfigPath ?? "."),
  );

  console.log(
    "[every-plugin] rspack.config.js not found — using the every-plugin build composition.",
  );
  return path.join(".every-plugin", "rspack.config.generated.mjs");
}

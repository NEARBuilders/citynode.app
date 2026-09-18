import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const hasContractConfig = fs.existsSync(path.resolve(process.cwd(), "tsconfig.contract.json"));

function run(
  cmd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`)),
    );
    child.on("error", reject);
  });
}

export async function emitContractTypes(): Promise<void> {
  if (!hasContractConfig) {
    console.log(
      "[every-plugin] tsconfig.contract.json not found — skipping contract type emission.",
    );
    return;
  }
  await run("tsc", ["-p", "tsconfig.contract.json"]);
}

/** Walks up from the workspace to find bos.config.json (deploy integrity reporting target). */
function findBosConfigPathSync(): string | null {
  let current = process.cwd();
  for (;;) {
    const candidate = path.join(current, "bos.config.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function pluginDisplayName(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
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

async function runRspack(deploy: boolean): Promise<void> {
  if (fs.existsSync(path.resolve(process.cwd(), "rspack.config.js"))) {
    await run("rspack", ["build"], deploy ? { DEPLOY: "true" } : {});
    return;
  }

  const bosConfigPath = findBosConfigPathSync();
  if (deploy && !bosConfigPath) {
    throw new Error(
      "[every-plugin] deploy needs bos.config.json (walking up from the workspace) for integrity reporting — pass a bosConfigPath from the pipeline or add rspack.config.js.",
    );
  }

  const overridesPath = path.resolve(process.cwd(), "build.config.ts");
  const hasOverrides = fs.existsSync(overridesPath);
  const generatedDir = path.join(process.cwd(), ".every-plugin");
  const generatedConfig = path.join(generatedDir, "rspack.config.generated.mjs");
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    generatedConfig,
    generatedRspackConfig(pluginDisplayName(), hasOverrides, bosConfigPath ?? "."),
  );

  console.log(
    "[every-plugin] rspack.config.js not found — using the every-plugin build composition.",
  );
  await run(
    "rspack",
    ["build", "--config", ".every-plugin/rspack.config.generated.mjs"],
    deploy ? { DEPLOY: "true" } : {},
  );
}

export function runCliCommand(raw: string): Promise<void> {
  const command = raw.replace(/=.*/, "");
  switch (command) {
    case "types":
      return emitContractTypes();
    case "build":
      return (async () => {
        await emitContractTypes();
        await runRspack(false);
      })();
    case "deploy":
      return (async () => {
        await emitContractTypes();
        await runRspack(true);
      })();
    case "dev":
      return (async () => {
        await emitContractTypes();
        const { startPluginDevServer } = await import("./dev/serve");
        await startPluginDevServer();
        return new Promise<void>(() => {});
      })();
    default:
      return Promise.reject(
        new Error(`Unknown every-plugin command: ${raw} (expected dev|types|build|deploy)`),
      );
  }
}

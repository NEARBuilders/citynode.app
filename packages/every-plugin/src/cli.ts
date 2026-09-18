import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureGeneratedRspackConfig } from "./build/rspack/generated-config";

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

async function runRspack(deploy: boolean): Promise<void> {
  const generatedConfig = ensureGeneratedRspackConfig();

  const args = generatedConfig ? ["build", "--config", generatedConfig] : ["build"];
  await run("rspack", args, deploy ? { DEPLOY: "true" } : {});
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

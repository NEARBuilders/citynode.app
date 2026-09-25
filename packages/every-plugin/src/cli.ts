import { spawn } from "node:child_process";
import { generateContractTypes } from "./build/contract-types";
import { ensureGeneratedRspackConfig } from "./build/rspack/generated-config";
import { ensureGeneratedUiRsbuildConfig } from "./ui/generated-config";

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
  const status = await generateContractTypes();
  if (status === "skipped") {
    console.log("[every-plugin] No api/src/contract.ts — nothing to emit.");
  } else {
    console.log(`[every-plugin] Contract types ${status}.`);
  }
}

async function runRspack(): Promise<void> {
  const generatedConfig = ensureGeneratedRspackConfig();

  const args = generatedConfig ? ["build", "--config", generatedConfig] : ["build"];
  await run("rspack", args, {});

  const uiConfig = ensureGeneratedUiRsbuildConfig(process.cwd());
  if (uiConfig) {
    console.log("[every-plugin] Building folder-form ui source…");
    await run("rsbuild", ["build", "--config", uiConfig], {});
  }
}

export function runCliCommand(raw: string): Promise<void> {
  const command = raw.replace(/=.*/, "");
  switch (command) {
    case "types":
      return emitContractTypes();
    case "build":
    case "deploy":
      return runRspack();
    case "dev":
      return (async () => {
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

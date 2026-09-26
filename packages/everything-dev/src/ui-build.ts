#!/usr/bin/env node
/**
 * Core-UI rsbuild runner — the child ui package's dev/build/preview scripts
 * route through this bin so the rsbuild config is synthesized when the
 * workspace has no local `rsbuild.config.ts`. A local config is honored as
 * an override, untouched.
 */

import { spawnSync } from "node:child_process";
import { resolveRsbuildConfig } from "./ui-build-config";

function main(): void {
  const [command = "build", ...rest] = process.argv.slice(2);
  const workspaceRoot = process.cwd();
  const configPath = resolveRsbuildConfig(workspaceRoot);
  if (!configPath) {
    console.error("[bos-ui] no rsbuild config and synthesis failed");
    process.exit(1);
  }
  const result = spawnSync("rsbuild", [command, "--config", configPath, ...rest], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

main();

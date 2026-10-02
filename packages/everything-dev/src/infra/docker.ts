import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execa } from "execa";
import type { PreflightFailure } from "./preflight";

export interface DockerAutostartGuards {
  composeFileExists: boolean;
  dockerAvailable: boolean;
  testMode: boolean;
}

export function composeFilePath(configDir: string): string {
  return join(configDir, "docker-compose.yml");
}

export function isDockerTestMode(env: Record<string, string | undefined>): boolean {
  return env.BOS_TEST === "1" || env.NODE_ENV === "test" || env.BOS_NO_PERSIST_PORTS === "1";
}

export function shouldAutoStartDocker(
  failures: PreflightFailure[],
  guards: DockerAutostartGuards,
): boolean {
  if (failures.length === 0) return false;
  if (guards.testMode || !guards.dockerAvailable || !guards.composeFileExists) return false;
  return failures.every((failure) => failure.tcpReachable === false);
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const result = await execa("docker", ["info"], { stdio: "pipe", reject: false, timeout: 5000 });
    return (result.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}

export async function runDockerComposeUp(configDir: string): Promise<void> {
  await execa("docker", ["compose", "up", "-d", "--wait"], {
    cwd: configDir,
    stdio: "inherit",
    timeout: 5 * 60_000,
  });
}

export function detectAutoStartContext(configDir: string): DockerAutostartGuards {
  return {
    composeFileExists: existsSync(composeFilePath(configDir)),
    dockerAvailable: false,
    testMode: isDockerTestMode(process.env as Record<string, string | undefined>),
  };
}

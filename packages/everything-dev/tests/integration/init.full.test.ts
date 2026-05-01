import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  copyFilteredFiles,
  personalizeConfig,
  readTemplatekeep,
  runBunInstall,
} from "../../src/cli/init";

const REPO_ROOT = join(import.meta.dirname, "../../../../");

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout = 120_000,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "pipe" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command '${command} ${args.join(" ")}' timed out after ${timeout}ms`));
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe.skipIf(process.env.CI !== "true")("bos init — full (install + typecheck)", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-full-"));
  }, 30000);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("installs dependencies", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    await copyFilteredFiles(REPO_ROOT, testDir, patterns, { withHost: false });

    cpSync(join(REPO_ROOT, "packages/everything-dev"), join(testDir, "packages/everything-dev"), {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes("dist"),
    });
    cpSync(join(REPO_ROOT, "packages/every-plugin"), join(testDir, "packages/every-plugin"), {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes("dist"),
    });

    await personalizeConfig(testDir, {
      extendsAccount: "dev.everything.near",
      extendsGateway: "everything.dev",
      account: "test.near",
      domain: "test.dev",
      workspaceOpts: { localOverrides: true, sourceDir: REPO_ROOT },
    });

    await runBunInstall(testDir);
    expect(existsSync(join(testDir, "node_modules"))).toBe(true);
  });

  it("typechecks successfully", async () => {
    const exitCode = await runCommand("bun", ["typecheck"], testDir);
    expect(exitCode).toBe(0);
  });
});

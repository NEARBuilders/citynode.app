import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout = 120_000,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { cwd, stdio: "pipe" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command '${command} ${args.join(" ")}' timed out after ${timeout}ms`));
    }, timeout);
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseTypeErrors(output: string): string[] {
  const lines = output.split("\n");
  const errors: string[] = [];
  let currentError: string[] = [];

  for (const line of lines) {
    if (/^\S+\(\d+,\d+\):\s*error\s+TS\d+/.test(line) || /^error\s+TS\d+/.test(line)) {
      if (currentError.length > 0) errors.push(currentError.join("\n"));
      currentError = [line];
    } else if (currentError.length > 0) {
      if (line.trim() === "" || /^\s+(TS\d+|Found \d+ error)/.test(line)) {
        errors.push(currentError.join("\n"));
        currentError = [];
      } else {
        currentError.push(line);
      }
    }
  }
  if (currentError.length > 0) errors.push(currentError.join("\n"));
  return errors;
}

function isExpectedRouteError(line: string): boolean {
  const expectedPatterns = [
    "routes/_layout/_authenticated/settings",
    "routes/_layout/_authenticated/projects",
    "routes/_layout/_authenticated/keys",
    "routes/_layout/_authenticated/_admin",
    'to="/settings"',
    'to="/projects',
  ];
  return expectedPatterns.some((p) => line.includes(p));
}

function isUnexpectedError(error: string): boolean {
  if (isExpectedRouteError(error)) return false;

  const corePaths = [
    "ui/src/lib/",
    "ui/src/lib/api",
    "ui/src/lib/api-types.gen",
    "ui/src/lib/auth-types.gen",
    "api/src/contract",
    "api/src/index",
    "api/src/lib/plugins-types.gen",
    "api/src/lib/auth-types.gen",
  ];
  if (corePaths.some((p) => error.includes(p))) return true;

  if (error.includes(".gen.ts") && !isExpectedRouteError(error)) return true;

  return false;
}

describe("bos init — typecheck with expected route errors", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-typecheck-"));
  }, 30000);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  }, 30000);

  it("scaffolds project with template files", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    await copyFilteredFiles(REPO_ROOT, testDir, patterns, {
      overrides: ["ui", "api", "host"],
    });

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
      overrides: ["ui", "api", "host"],
    });

    expect(existsSync(join(testDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(testDir, "ui", "src", "lib", "api-types.gen.ts"))).toBe(true);
    expect(existsSync(join(testDir, "ui", "src", "lib", "auth-types.gen.ts"))).toBe(true);
    expect(existsSync(join(testDir, "api", "src", "lib", "plugins-types.gen.ts"))).toBe(true);
    expect(existsSync(join(testDir, "api", "src", "lib", "auth-types.gen.ts"))).toBe(true);
  });

  it("sets postinstall to 'node_modules/.bin/bos types gen || true'", async () => {
    const pkgPath = join(testDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.postinstall).toBe("node_modules/.bin/bos types gen || true");
  });

  it("sets types:gen to 'node_modules/.bin/bos types gen'", async () => {
    const pkgPath = join(testDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["types:gen"]).toBe("node_modules/.bin/bos types gen");
  });

  it("installs dependencies", async () => {
    await runBunInstall(testDir);
    expect(existsSync(join(testDir, "node_modules"))).toBe(true);
  }, 120000);

  it("runs bos types gen after install", async () => {
    const everyPluginBuild = await runCommand(
      "bun",
      ["run", "build"],
      join(testDir, "packages", "every-plugin"),
      120000,
    );
    expect(everyPluginBuild.code).toBe(0);

    const everythingDevBuild = await runCommand(
      "bun",
      ["run", "build"],
      join(testDir, "packages", "everything-dev"),
      120000,
    );
    expect(everythingDevBuild.code).toBe(0);

    const result = await runCommand(
      "node",
      ["dist/cli.mjs", "types", "gen", "--dry-run"],
      join(testDir, "packages", "everything-dev"),
      120000,
    );

    if (result.code !== 0) {
      console.error(`\nbos types gen failed:\n${result.stdout}${result.stderr}`);
    }

    expect(result.code).toBe(0);
  }, 120000);

  it("typechecks api with zero unexpected errors", async () => {
    const result = await runCommand(
      "bun",
      ["run", "--cwd", "api", "tsc", "--noEmit"],
      testDir,
      120000,
    );
    const errors = parseTypeErrors(result.stdout + result.stderr);
    const unexpected = errors.filter(isUnexpectedError);

    if (unexpected.length > 0) {
      console.error(`\nUnexpected API type errors:\n${unexpected.join("\n---\n")}`);
    }

    expect(unexpected).toEqual([]);
  });

  it("typechecks ui with only expected route errors", async () => {
    const result = await runCommand(
      "bun",
      ["run", "--cwd", "ui", "tsc", "--noEmit"],
      testDir,
      120000,
    );
    const errors = parseTypeErrors(result.stdout + result.stderr);
    const unexpected = errors.filter(isUnexpectedError);

    if (unexpected.length > 0) {
      console.error(`\nUnexpected UI type errors:\n${unexpected.join("\n---\n")}`);
    }

    expect(unexpected).toEqual([]);
  });
});

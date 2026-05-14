import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildInitPatterns,
  copyFilteredFiles,
  personalizeConfig,
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

function writeGeneratedAuthStubs(projectDir: string) {
  const authDir = join(projectDir, ".bos", "generated", "auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    join(authDir, "auth-export.d.ts"),
    `export type Auth = any;
export type AuthOrganizationContext = any;
export type AuthOrganization = any;
export type AuthOrganizationSummary = any;
export type AuthOrganizationMember = any;
export type AuthApiKey = any;
export type AuthInvitation = any;
export type GetActiveMemberInput = any;
export type GetOrganizationInput = any;
export type ListMembersInput = any;
export type ListInvitationsInput = any;
export type ListApiKeysInput = any;
export type AuthServices = any;
export type createAuthInstance = any;
`,
  );
  writeFileSync(
    join(authDir, "contract.d.ts"),
    `export type ContractType = any;
export type InferOutput<_TRoute extends string> = any;
`,
  );
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
    const patterns = buildInitPatterns({
      withUi: true,
      withApi: true,
      plugins: ["apps", "projects", "settings"],
    });
    await copyFilteredFiles(REPO_ROOT, testDir, patterns);

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
      withUi: true,
      withApi: true,
      plugins: ["apps", "projects", "settings"],
      workspaceOpts: { localOverrides: true, sourceDir: REPO_ROOT },
    });

    await runBunInstall(testDir);
    writeGeneratedAuthStubs(testDir);
    expect(existsSync(join(testDir, "node_modules"))).toBe(true);
  });

  it("typechecks successfully", async () => {
    const exitCode = await runCommand("bun", ["typecheck"], testDir);
    expect(exitCode).toBe(0);
  });
});

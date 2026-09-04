import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildInitPatterns,
  copyFilteredFiles,
  personalizeConfig,
  runBunInstall,
} from "../../src/cli/init";
import { getFrameworkTarballs, rewriteFrameworkPackageSpecs } from "./framework-packages";
import {
  assertTypecheckSuccess,
  runCommand,
  runTypecheck,
  writeGeneratedAuthStubs,
  writePermissiveTypeStubs,
} from "./typecheck-utils";

const REPO_ROOT = join(import.meta.dirname, "../../../../");

describe.skipIf(process.env.CI !== "true")("bos init — full (install + typecheck)", () => {
  let testDir: string;
  let frameworkTarballs: Awaited<ReturnType<typeof getFrameworkTarballs>>;

  beforeAll(async () => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-full-"));
    frameworkTarballs = await getFrameworkTarballs(REPO_ROOT);
  }, 180_000);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  }, 120_000);

  it("installs dependencies and typechecks", async () => {
    const patterns = buildInitPatterns(["ui", "api", "plugins"], ["template"], {
      template: "_template",
    });
    await copyFilteredFiles(REPO_ROOT, testDir, patterns, {
      overrides: ["ui", "api", "plugins"],
      plugins: ["template"],
    });

    await personalizeConfig(testDir, {
      extendsAccount: "dev.everything.near",
      extendsGateway: "dev.everything.dev",
      account: "test.near",
      domain: "test.dev",
      workspaceOpts: { sourceDir: REPO_ROOT },
      overrides: ["ui", "api", "plugins"],
      plugins: ["template"],
    });
    rewriteFrameworkPackageSpecs(testDir, frameworkTarballs);

    await runBunInstall(testDir);
    writeGeneratedAuthStubs(testDir);
    expect(existsSync(join(testDir, "node_modules"))).toBe(true);

    const typesGenResult = await runCommand("bun", ["run", "types:gen"], testDir);
    expect(typesGenResult.code).toBe(0);

    writePermissiveTypeStubs(testDir);

    const apiResult = await runTypecheck(testDir, "api", { raw: true });
    const pluginResult = await runTypecheck(testDir, "plugins/_template", { raw: true });

    assertTypecheckSuccess(apiResult, "api");
    assertTypecheckSuccess(pluginResult, "plugins/_template");
  }, 240_000);
});

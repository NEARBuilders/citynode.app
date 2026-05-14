import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureEnvFile, writeGeneratedInfra } from "../../src/cli/infra";
import { buildInitPatterns, copyFilteredFiles, personalizeConfig } from "../../src/cli/init";
import { loadConfig } from "../../src/config";

const REPO_ROOT = join(import.meta.dirname, "../../../../");

describe("bos init - relative directory", () => {
  let workingDir: string;
  let previousCwd: string;

  beforeAll(() => {
    workingDir = mkdtempSync(join(tmpdir(), "bos-init-relative-"));
    previousCwd = process.cwd();
    process.chdir(workingDir);
  });

  afterAll(() => {
    process.chdir(previousCwd);
    rmSync(workingDir, { recursive: true, force: true });
  });

  it("loads config and generates infra when the target directory starts as relative", async () => {
    const relativeDir = "testing.com";
    const targetDir = resolve(relativeDir);
    const patterns = buildInitPatterns(["ui", "api"]);

    await copyFilteredFiles(REPO_ROOT, targetDir, patterns, {
      overrides: ["ui", "api"],
      plugins: [],
    });
    await personalizeConfig(targetDir, {
      extendsAccount: "dev.everything.near",
      extendsGateway: "everything.dev",
      account: "testing.near",
      domain: "testing.com",
      plugins: [],
      overrides: ["ui", "api", "plugins"],
      workspaceOpts: { sourceDir: REPO_ROOT },
    });

    const loaded = await loadConfig({ cwd: targetDir });
    expect(loaded?.config.account).toBe("testing.near");
    expect(loaded?.config.domain).toBe("testing.com");

    if (!loaded?.runtime) {
      throw new Error("Expected runtime config to be available");
    }

    writeGeneratedInfra(targetDir, loaded.runtime);
    ensureEnvFile(targetDir);

    expect(existsSync(join(targetDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);
    expect(existsSync(join(targetDir, "docker-compose.yml"))).toBe(true);

    const envExample = readFileSync(join(targetDir, ".env.example"), "utf-8");
    const dockerCompose = readFileSync(join(targetDir, "docker-compose.yml"), "utf-8");

    expect(envExample).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(envExample).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(envExample).toContain("BETTER_AUTH_SECRET=");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(envExample).not.toContain("PROJECTS_DATABASE_URL=");

    expect(dockerCompose).toContain("postgres-api:");
    expect(dockerCompose).toContain("postgres-auth:");
    expect(dockerCompose).not.toContain("postgres-projects:");
  });
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRsbuildConfig } from "../src/ui-build-config";

const scratch = join(tmpdir(), "bos-ui-build-test");

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function makeWorkspace(withLocalConfig: boolean, withRootConfig = true): string {
  const repoRoot = join(scratch, `repo-${String(withLocalConfig)}-${String(withRootConfig)}`);
  const uiDir = join(repoRoot, "ui");
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(join(uiDir, "package.json"), JSON.stringify({ name: "ui", version: "0.0.0" }));
  if (withRootConfig) {
    writeFileSync(
      join(repoRoot, "bos.config.json"),
      JSON.stringify({ domain: "x.test", account: "a.near" }),
    );
  }
  if (withLocalConfig) {
    writeFileSync(join(uiDir, "rsbuild.config.ts"), "export default {};\n");
  }
  return uiDir;
}

describe("core ui rsbuild synthesis", () => {
  it("honors a local rsbuild.config.ts as an override, untouched", () => {
    const uiDir = makeWorkspace(true);
    const resolved = resolveRsbuildConfig(uiDir);
    expect(resolved).toBe(join(uiDir, "rsbuild.config.ts"));
  });

  it("synthesizes the generated config when no local config exists", () => {
    const uiDir = makeWorkspace(false);
    const resolved = resolveRsbuildConfig(uiDir);
    expect(resolved).toBe(
      join(scratch, "repo-false-true", ".bos", "ui.rsbuild.config.generated.mjs"),
    );
    expect(existsSync(resolved!)).toBe(true);
    const content = readFileSync(resolved!, "utf8");
    expect(content).toContain("createUiRsbuildConfig");
    expect(content).toContain('role: "provider"');
    expect(content).toContain('"./src/entry.ts"');
    expect(content).toContain("import.meta.env.APP_NAME");
    expect(content).toContain('path.resolve(repoRoot, "ui")');
  });

  it("falls back to bos.config.json when no resolved config exists", () => {
    const uiDir = makeWorkspace(false, true);
    const resolved = resolveRsbuildConfig(uiDir);
    expect(existsSync(resolved!)).toBe(true);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureGeneratedRspackConfig,
  findBosConfigPath,
} from "../../src/build/rspack/generated-config";

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "every-plugin-gen-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensureGeneratedRspackConfig", () => {
  it("emits a plain config when no bos.config.json is reachable", () => {
    const workspace = makeTempWorkspace();
    fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: "test-plugin" }));

    const generated = ensureGeneratedRspackConfig(workspace);
    expect(generated).toBe(path.join(".every-plugin", "rspack.config.generated.mjs"));

    const source = fs.readFileSync(path.join(workspace, generated!), "utf8");
    expect(source).toContain("const bosConfigPath = null");
    expect(source).toContain("export default bosConfigPath");
    expect(source.trimEnd().endsWith(": config;")).toBe(true);
  });

  it("wraps withPluginDeploy when a bos.config.json exists above the workspace", () => {
    const root = makeTempWorkspace();
    const workspace = path.join(root, "plugins", "my-plugin");
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(root, "bos.config.json"), "{}");
    fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: "my-plugin" }));

    const generated = ensureGeneratedRspackConfig(workspace);
    const source = fs.readFileSync(path.join(workspace, generated!), "utf8");
    expect(source).toContain(
      `const bosConfigPath = ${JSON.stringify(path.join(root, "bos.config.json"))}`,
    );
    expect(source).toContain("withPluginDeploy(config");
  });
});

describe("findBosConfigPath", () => {
  it("is shared with the compose module and walks up to the nearest bos.config.json", () => {
    const root = makeTempWorkspace();
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findBosConfigPath(nested)).toBeNull();

    fs.writeFileSync(path.join(root, "bos.config.json"), "{}");
    expect(findBosConfigPath(nested)).toBe(path.join(root, "bos.config.json"));
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveDevConfigPath,
  resolvePluginContract,
  resolvePluginEntry,
} from "../../src/entry-resolution";

let dir: string;
let apiSlotDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "every-plugin-entry-resolution-"));
  apiSlotDir = join(dir, "api");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (rel: string, contents = "export {};\n") => {
  const filePath = join(dir, rel);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
};

describe("resolvePluginEntry", () => {
  it("resolves api/src/index.ts for a plugin App", () => {
    write("api/src/index.ts");
    expect(resolvePluginEntry(dir)).toBe("api/src/index.ts");
  });

  it("resolves src/index.ts when the cwd is the ancestor config's declared api slot", () => {
    write("api/src/index.ts");
    write("bos.config.json", JSON.stringify({ app: { api: { development: "local:api" } } }));
    expect(resolvePluginEntry(apiSlotDir)).toBe("src/index.ts");
  });

  it("throws on the removed src/index.ts layout with a migration hint", () => {
    write("src/index.ts");
    expect(() => resolvePluginEntry(dir)).toThrow(/mkdir api && git mv src api\/src/);
  });

  it("returns null when no entry exists", () => {
    expect(resolvePluginEntry(dir)).toBeNull();
  });
});

describe("resolvePluginContract", () => {
  it("resolves api/src/contract.ts for a plugin App", () => {
    write("api/src/contract.ts");
    expect(resolvePluginContract(dir)).toBe("api/src/contract.ts");
  });

  it("resolves src/contract.ts when the cwd is the declared api slot", () => {
    write("api/src/contract.ts");
    write("bos.config.json", JSON.stringify({ app: { api: { development: "local:api" } } }));
    expect(resolvePluginContract(apiSlotDir)).toBe("src/contract.ts");
  });

  it("throws on the removed src/contract.ts layout with a migration hint", () => {
    write("src/contract.ts");
    expect(() => resolvePluginContract(dir)).toThrow(/api\/src\/contract\.ts/);
  });

  it("returns null when no contract exists", () => {
    expect(resolvePluginContract(dir)).toBeNull();
  });
});

describe("resolveDevConfigPath", () => {
  it("resolves bos.dev.ts", () => {
    write("bos.dev.ts");
    expect(resolveDevConfigPath(dir)).toBe(join(dir, "bos.dev.ts"));
  });

  it("throws on the removed plugin.dev.ts with a rename hint", () => {
    write("plugin.dev.ts");
    expect(() => resolveDevConfigPath(dir)).toThrow(/rename it to bos\.dev\.ts/);
  });

  it("returns null when neither file exists", () => {
    expect(resolveDevConfigPath(dir)).toBeNull();
  });
});

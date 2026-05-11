import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getResolvedConfigPath } from "../../src/config";
import type { ResolvedConfigMeta } from "../../src/merge";
import { syncAndGenerateSharedUi } from "../../src/shared";

const VALID_CONFIG = {
  account: "test.near",
  domain: "test.dev",
  shared: {
    ui: {
      effect: { version: "3.21.0", singleton: true },
      zod: { version: "4.3.6", singleton: true },
    },
  },
  app: {
    host: { development: "http://localhost:3000", production: "https://host.test.dev" },
    ui: { name: "ui", development: "http://localhost:3003", production: "https://ui.test.dev" },
    api: { name: "api", development: "http://localhost:3001", production: "https://api.test.dev" },
  },
};

const CATALOG = {
  effect: "3.21.0",
  zod: "4.3.6",
  react: "19.2.4",
};

describe("shared sync resolved config", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-shared-sync-"));
    writeFileSync(join(testDir, "bos.config.json"), `${JSON.stringify(VALID_CONFIG, null, 2)}\n`);
    writeFileSync(
      join(testDir, "package.json"),
      `${JSON.stringify(
        {
          name: "test-app",
          private: true,
          workspaces: {
            packages: ["ui", "api"],
            catalog: CATALOG,
          },
        },
        null,
        2,
      )}\n`,
    );
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("catalog->bos mode writes to .bos/bos.resolved-config.json, not bos.config.json", async () => {
    const beforeBos = readFileSync(join(testDir, "bos.config.json"), "utf-8");

    const result = await syncAndGenerateSharedUi({
      configDir: testDir,
      hostMode: "local",
    });

    expect(result.mode).toBe("catalog->bos");

    const afterBos = readFileSync(join(testDir, "bos.config.json"), "utf-8");
    expect(afterBos).toBe(beforeBos);

    const resolvedPath = getResolvedConfigPath(testDir);
    expect(existsSync(resolvedPath)).toBe(true);

    const resolved = JSON.parse(readFileSync(resolvedPath, "utf-8")) as Record<string, unknown>;
    expect(resolved._resolved).toBeDefined();
    expect((resolved._resolved as ResolvedConfigMeta).source).toBe("shared-sync");
    expect(resolved.account).toBe("test.near");
  });

  it("bos->catalog mode writes to bos.config.json directly", async () => {
    const remoteDir = mkdtempSync(join(tmpdir(), "bos-shared-remote-"));
    try {
      writeFileSync(
        join(remoteDir, "bos.config.json"),
        `${JSON.stringify(VALID_CONFIG, null, 2)}\n`,
      );
      writeFileSync(
        join(remoteDir, "package.json"),
        `${JSON.stringify(
          {
            name: "remote-app",
            workspaces: { packages: ["ui", "api"], catalog: {} },
          },
          null,
          2,
        )}\n`,
      );

      const result = await syncAndGenerateSharedUi({
        configDir: remoteDir,
        hostMode: "remote",
      });

      expect(result.mode).toBe("bos->catalog");

      const pkg = JSON.parse(readFileSync(join(remoteDir, "package.json"), "utf-8")) as any;
      expect(pkg.workspaces.catalog.effect).toBe("3.21.0");
    } finally {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  it("shared dep versions sync from catalog to resolved config", async () => {
    await syncAndGenerateSharedUi({
      configDir: testDir,
      hostMode: "local",
    });

    const resolved = JSON.parse(readFileSync(getResolvedConfigPath(testDir), "utf-8")) as Record<
      string,
      unknown
    >;
    const ui = (resolved.shared as Record<string, unknown>).ui as Record<
      string,
      Record<string, unknown>
    >;
    expect(ui.effect.version).toBe("3.21.0");
    expect(ui.zod.version).toBe("4.3.6");
  });

  it("fingerprint is deterministic for same deps", async () => {
    const r1 = await syncAndGenerateSharedUi({ configDir: testDir, hostMode: "local" });
    const r2 = await syncAndGenerateSharedUi({ configDir: testDir, hostMode: "local" });
    expect(r1.resolved.fingerprintSha256).toBe(r2.resolved.fingerprintSha256);
  });
});

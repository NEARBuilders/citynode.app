import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findPluginKey } from "../../src/integrity";

const tmpDirs: string[] = [];

function makeConfig(config: Record<string, unknown>): {
  configPath: string;
  configDir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "find-plugin-key-"));
  tmpDirs.push(dir);
  const configDir = join(dir, "config-dir");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "bos.config.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return {
    configPath,
    configDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("findPluginKey", () => {
  describe("app slot", () => {
    it("resolves app.auth to plugins/auth directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          host: { development: "local:host" },
          ui: { development: "local:ui" },
          api: { development: "local:api" },
          auth: { development: "local:plugins/auth" },
        },
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "auth"));
        expect(result).toEqual({ key: "auth", slot: "app" });
      } finally {
        cleanup();
      }
    });

    it("resolves app.host to host directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          host: { development: "local:host" },
        },
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "host"));
        expect(result).toEqual({ key: "host", slot: "app" });
      } finally {
        cleanup();
      }
    });

    it("resolves app.ui to ui directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          ui: { development: "local:ui" },
        },
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "ui"));
        expect(result).toEqual({ key: "ui", slot: "app" });
      } finally {
        cleanup();
      }
    });

    it("resolves app.api to api directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          api: { development: "local:api" },
        },
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "api"));
        expect(result).toEqual({ key: "api", slot: "app" });
      } finally {
        cleanup();
      }
    });
  });

  describe("plugins slot", () => {
    it("resolves plugins.template to plugins/_template directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {},
        plugins: {
          template: { development: "local:plugins/_template" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "_template"));
        expect(result).toEqual({ key: "template", slot: "plugins" });
      } finally {
        cleanup();
      }
    });

    it("resolves plugins.apps to plugins/apps directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {},
        plugins: {
          apps: { development: "local:plugins/apps" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "apps"));
        expect(result).toEqual({ key: "apps", slot: "plugins" });
      } finally {
        cleanup();
      }
    });

    it("resolves plugins.proposals to plugins/proposals directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {},
        plugins: {
          proposals: { development: "local:plugins/proposals" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "proposals"));
        expect(result).toEqual({ key: "proposals", slot: "plugins" });
      } finally {
        cleanup();
      }
    });

    it("resolves plugins.votes to plugins/votes directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {},
        plugins: {
          votes: { development: "local:plugins/votes" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "votes"));
        expect(result).toEqual({ key: "votes", slot: "plugins" });
      } finally {
        cleanup();
      }
    });
  });

  describe("non-matching paths", () => {
    it("returns null when no entry points at the directory", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          auth: { development: "local:plugins/auth" },
        },
        plugins: {
          template: { development: "local:plugins/_template" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "nope"));
        expect(result).toBeNull();
      } finally {
        cleanup();
      }
    });

    it("returns null when config has no matching app or plugins entries", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {},
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "auth"));
        expect(result).toBeNull();
      } finally {
        cleanup();
      }
    });

    it("skips entries whose development field is missing or not 'local:'", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          auth: {},
        },
        plugins: {
          remote1: { production: "https://cdn.example.com/1" },
          remote2: { development: "bos://something/host" },
          remote3: { development: "http://other/path" },
        },
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "auth"));
        expect(result).toBeNull();
      } finally {
        cleanup();
      }
    });

    it("skips entries whose development is not a string", () => {
      const { configPath, configDir, cleanup } = makeConfig({
        app: {
          auth: { development: 42 },
        },
        plugins: {},
      });
      try {
        const result = findPluginKey(configPath, join(configDir, "plugins", "auth"));
        expect(result).toBeNull();
      } finally {
        cleanup();
      }
    });
  });

  describe("agnostic over both slots", () => {
    it("finds a match whether it lives in app.* or plugins.*", () => {
      const appCfg = {
        app: { auth: { development: "local:plugins/auth" } },
        plugins: {},
      };
      const { configPath: aPath, configDir: aDir, cleanup: aCleanup } = makeConfig(appCfg);
      try {
        expect(findPluginKey(aPath, join(aDir, "plugins", "auth"))).toEqual({
          key: "auth",
          slot: "app",
        });
      } finally {
        aCleanup();
      }

      const pluginsCfg = {
        app: {},
        plugins: { auth: { development: "local:plugins/auth" } },
      };
      const { configPath: pPath, configDir: pDir, cleanup: pCleanup } = makeConfig(pluginsCfg);
      try {
        expect(findPluginKey(pPath, join(pDir, "plugins", "auth"))).toEqual({
          key: "auth",
          slot: "plugins",
        });
      } finally {
        pCleanup();
      }
    });
  });
});

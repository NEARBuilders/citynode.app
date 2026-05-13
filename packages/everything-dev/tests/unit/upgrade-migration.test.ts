import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateBosConfigFiles } from "../../src/cli/upgrade";

describe("upgrade bos config migration", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeProjectDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "upgrade-migration-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, "plugins/projects"), { recursive: true });
    return dir;
  }

  it("rewrites extends targets with #path and merges plugin config into root", async () => {
    const projectDir = makeProjectDir();
    writeFileSync(
      join(projectDir, "bos.config.json"),
      `${JSON.stringify(
        {
          account: "test.near",
          app: {
            host: { development: "local:host", production: "https://host.test.dev" },
            ui: { name: "ui", development: "local:ui", production: "https://ui.test.dev" },
            api: { name: "api", development: "local:api", production: "https://api.test.dev" },
            auth: { extends: "bos://auth.everything.near/auth.everything.dev" },
          },
          plugins: {
            projects: {
              extends: "bos://dev.everything.near/projects.everything.dev",
              development: "local:plugins/projects",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    writeFileSync(
      join(projectDir, "plugins/projects/bos.config.json"),
      `${JSON.stringify(
        {
          domain: "projects.everything.dev",
          app: {
            api: {
              development: "local:.",
              production: "https://projects.test.dev",
              secrets: ["PROJECTS_DATABASE_URL"],
            },
          },
          sidebar: [{ icon: "FolderKanban", label: "projects" }],
          routes: ["ui/src/routes/_layout/_authenticated/projects/**"],
        },
        null,
        2,
      )}\n`,
    );

    const migrated = await migrateBosConfigFiles(projectDir);

    expect(migrated).toContain("bos.config.json");
    expect(migrated).toContain("plugins/projects/bos.config.json");
    expect(existsSync(join(projectDir, "plugins/projects/bos.config.json"))).toBe(false);

    const rootConfig = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      app: { auth: { extends: string } };
      plugins: {
        projects: {
          extends?: string;
          development: string;
          production?: string;
          secrets?: string[];
          sidebar?: Array<{ icon: string; label: string }>;
          routes?: string[];
        };
      };
    };

    expect(rootConfig.app.auth.extends).toBe(
      "bos://auth.everything.near/auth.everything.dev#app.auth",
    );

    expect(rootConfig.plugins.projects.development).toBe("local:plugins/projects");
    expect(rootConfig.plugins.projects.production).toBe("https://projects.test.dev");
    expect(rootConfig.plugins.projects.secrets).toEqual(["PROJECTS_DATABASE_URL"]);
    expect(rootConfig.plugins.projects.sidebar).toEqual([
      { icon: "FolderKanban", label: "projects" },
    ]);
    expect(rootConfig.plugins.projects.routes).toEqual([
      "ui/src/routes/_layout/_authenticated/projects/**",
    ]);
  });

  it("removes extends from self-owned local plugins", async () => {
    const projectDir = makeProjectDir();
    writeFileSync(
      join(projectDir, "bos.config.json"),
      `${JSON.stringify(
        {
          account: "test.near",
          app: {
            host: { development: "local:host", production: "https://host.test.dev" },
            ui: { name: "ui", development: "local:ui", production: "https://ui.test.dev" },
            api: { name: "api", development: "local:api", production: "https://api.test.dev" },
          },
          plugins: {
            projects: {
              extends: "bos://dev.everything.near/projects.everything.dev#plugins.projects",
              development: "local:plugins/projects",
              secrets: ["PROJECTS_DATABASE_URL"],
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    mkdirSync(join(projectDir, "plugins/projects"), { recursive: true });
    writeFileSync(
      join(projectDir, "plugins/projects/bos.config.json"),
      `${JSON.stringify(
        {
          domain: "projects.everything.dev",
          plugins: {
            projects: {
              name: "projects",
              development: "local:.",
              production: "https://projects.test.dev",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await migrateBosConfigFiles(projectDir);

    const rootConfig = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      plugins: {
        projects: {
          extends?: string;
          name?: string;
          development: string;
          production?: string;
        };
      };
    };

    expect(rootConfig.plugins.projects.extends).toBeUndefined();
    expect(rootConfig.plugins.projects.name).toBeUndefined();
    expect(rootConfig.plugins.projects.development).toBe("local:plugins/projects");
    expect(rootConfig.plugins.projects.production).toBe("https://projects.test.dev");
  });

  it("removes name from plugin entries", async () => {
    const projectDir = makeProjectDir();
    writeFileSync(
      join(projectDir, "bos.config.json"),
      `${JSON.stringify(
        {
          account: "test.near",
          app: {
            host: { development: "local:host" },
            ui: { name: "ui", development: "local:ui" },
            api: { name: "api", development: "local:api" },
          },
          plugins: {
            projects: {
              name: "projects",
              development: "local:plugins/projects",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await migrateBosConfigFiles(projectDir);

    const rootConfig = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      plugins: { projects: { name?: string; development: string } };
    };

    expect(rootConfig.plugins.projects.name).toBeUndefined();
    expect(rootConfig.plugins.projects.development).toBe("local:plugins/projects");
  });

  it("merges top-level sidebar and routes from plugin config into root entry", async () => {
    const projectDir = makeProjectDir();
    writeFileSync(
      join(projectDir, "bos.config.json"),
      `${JSON.stringify(
        {
          account: "test.near",
          app: {
            host: { development: "local:host" },
            ui: { name: "ui", development: "local:ui" },
            api: { name: "api", development: "local:api" },
          },
          plugins: {
            apps: {
              development: "local:plugins/apps",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    mkdirSync(join(projectDir, "plugins/apps"), { recursive: true });
    writeFileSync(
      join(projectDir, "plugins/apps/bos.config.json"),
      `${JSON.stringify(
        {
          domain: "apps.everything.dev",
          sidebar: [{ icon: "Globe", label: "apps", roleRequired: "anon" }],
          routes: ["ui/src/routes/_layout/apps/**"],
        },
        null,
        2,
      )}\n`,
    );

    await migrateBosConfigFiles(projectDir);

    expect(existsSync(join(projectDir, "plugins/apps/bos.config.json"))).toBe(false);

    const rootConfig = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      plugins: {
        apps: {
          development: string;
          sidebar?: unknown;
          routes?: unknown;
        };
      };
    };

    expect(rootConfig.plugins.apps.sidebar).toEqual([
      { icon: "Globe", label: "apps", roleRequired: "anon" },
    ]);
    expect(rootConfig.plugins.apps.routes).toEqual(["ui/src/routes/_layout/apps/**"]);
  });

  it("deletes plugin bos.config.json files even when no metadata to merge", async () => {
    const projectDir = makeProjectDir();
    writeFileSync(
      join(projectDir, "bos.config.json"),
      `${JSON.stringify(
        {
          account: "test.near",
          app: {
            host: { development: "local:host" },
            ui: { name: "ui", development: "local:ui" },
            api: { name: "api", development: "local:api" },
          },
          plugins: {
            projects: {
              development: "local:plugins/projects",
              secrets: ["PROJECTS_DATABASE_URL"],
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    mkdirSync(join(projectDir, "plugins/projects"), { recursive: true });
    writeFileSync(
      join(projectDir, "plugins/projects/bos.config.json"),
      `${JSON.stringify(
        {
          domain: "projects.everything.dev",
          plugins: {
            projects: {
              name: "projects",
              development: "local:.",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const migrated = await migrateBosConfigFiles(projectDir);

    expect(migrated).toContain("plugins/projects/bos.config.json");
    expect(existsSync(join(projectDir, "plugins/projects/bos.config.json"))).toBe(false);
  });
});

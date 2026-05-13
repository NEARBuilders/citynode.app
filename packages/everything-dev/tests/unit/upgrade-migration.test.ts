import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("rewrites extends targets and migrates plugin provider metadata", async () => {
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

    const rootConfig = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      app: { auth: { extends: string } };
      plugins: { projects: { extends: string } };
    };
    expect(rootConfig.app.auth.extends).toBe(
      "bos://auth.everything.near/auth.everything.dev#app.auth",
    );
    expect(rootConfig.plugins.projects.extends).toBe(
      "bos://dev.everything.near/projects.everything.dev#plugins.projects",
    );

    const providerConfig = JSON.parse(
      readFileSync(join(projectDir, "plugins/projects/bos.config.json"), "utf-8"),
    ) as {
      app?: unknown;
      sidebar?: unknown;
      routes?: unknown;
      plugins: {
        projects: {
          development: string;
          production: string;
          secrets: string[];
          sidebar: Array<{ icon: string; label: string }>;
          routes: string[];
        };
      };
    };

    expect(providerConfig.app).toBeUndefined();
    expect(providerConfig.sidebar).toBeUndefined();
    expect(providerConfig.routes).toBeUndefined();
    expect(providerConfig.plugins.projects.development).toBe("local:.");
    expect(providerConfig.plugins.projects.production).toBe("https://projects.test.dev");
    expect(providerConfig.plugins.projects.secrets).toEqual(["PROJECTS_DATABASE_URL"]);
    expect(providerConfig.plugins.projects.sidebar).toEqual([
      { icon: "FolderKanban", label: "projects" },
    ]);
    expect(providerConfig.plugins.projects.routes).toEqual([
      "ui/src/routes/_layout/_authenticated/projects/**",
    ]);
  });
});

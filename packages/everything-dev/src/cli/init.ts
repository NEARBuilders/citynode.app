import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { glob } from "glob";
import { fetchBosConfigFromFastKv } from "../fastkv";
import type { BosConfig } from "../types";

const require = createRequire(import.meta.url);

interface SourceResult {
  sourceDir: string;
  parentConfig: BosConfig;
  cleanup: () => Promise<void>;
}

export async function resolveSourceDir(opts: {
  account: string;
  gateway: string;
  source?: string;
}): Promise<SourceResult> {
  if (opts.source) {
    const sourceDir = resolve(opts.source);
    if (!existsSync(join(sourceDir, "bos.config.json"))) {
      throw new Error(`No bos.config.json found in source directory: ${sourceDir}`);
    }
    const parentConfig = JSON.parse(
      readFileSync(join(sourceDir, "bos.config.json"), "utf-8"),
    ) as BosConfig;
    return { sourceDir, parentConfig, cleanup: async () => {} };
  }

  const parentConfig = await fetchParentConfig(opts.account, opts.gateway);

  if (!parentConfig.repository) {
    throw new Error("Parent config has no repository field — cannot locate template source");
  }

  const { dir: sourceDir, cleanup } = await downloadTarball(parentConfig.repository);
  return { sourceDir, parentConfig, cleanup };
}

export async function fetchParentConfig(account: string, gateway: string): Promise<BosConfig> {
  const bosUrl = `bos://${account}/${gateway}`;
  return fetchBosConfigFromFastKv<BosConfig>(bosUrl);
}

export async function downloadTarball(
  repoUrl: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Cannot parse repository URL: ${repoUrl}`);
  }

  const { owner, repo, branch } = parsed;
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${branch}`;

  const tmpDir = mkTmpDir("bos-init-tarball-");
  const tarballPath = join(tmpDir, "source.tar.gz");

  const response = await fetch(tarballUrl, {
    headers: { "User-Agent": "everything-dev" },
    redirect: "follow",
  });

  if (!response.ok) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`GitHub tarball download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("GitHub tarball download returned empty body");
  }

  const fileStream = createWriteStream(tarballPath);
  const reader = response.body as unknown as NodeJS.ReadableStream;
  await pipeline(reader, fileStream);

  const extractDir = mkTmpDir("bos-init-extract-");
  try {
    const tar = require("tar") as {
      extract: (opts: { cwd: string; file: string; strip: number }) => Promise<void>;
    };
    await tar.extract({ cwd: extractDir, file: tarballPath, strip: 1 });
  } catch {
    await execCommand("tar", ["-xzf", tarballPath, "--strip-components=1", "-C", extractDir]);
  }

  rmSync(tmpDir, { recursive: true, force: true });

  return {
    dir: extractDir,
    cleanup: async () => {
      rmSync(extractDir, { recursive: true, force: true });
    },
  };
}

function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string } | null {
  const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2], branch: "main" };
  }

  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2], branch: "main" };
  }

  return null;
}

export async function readTemplatekeep(sourceDir: string): Promise<string[]> {
  const keepFile = join(sourceDir, ".templatekeep");
  if (!existsSync(keepFile)) {
    return [];
  }

  const content = readFileSync(keepFile, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export async function copyFilteredFiles(
  sourceDir: string,
  destination: string,
  patterns: string[],
  options: { withHost: boolean },
): Promise<number> {
  if (patterns.length === 0) {
    return 0;
  }

  const effectivePatterns = options.withHost
    ? patterns
    : patterns.filter((p) => !p.startsWith("host/") && p !== "host/**");

  const allFiles = new Set<string>();
  for (const pattern of effectivePatterns) {
    const matches = await glob(pattern, {
      cwd: sourceDir,
      nodir: true,
      dot: true,
      absolute: false,
    });
    for (const match of matches) {
      allFiles.add(match);
    }
  }

  mkdirSync(destination, { recursive: true });

  let count = 0;
  for (const filePath of allFiles) {
    const src = join(sourceDir, filePath);
    const stat = lstatSync(src);
    if (!stat.isFile()) continue;

    const dest = join(destination, filePath);
    mkdirSync(dirname(dest), { recursive: true });
    const content = readFileSync(src);
    writeFileSync(dest, content);
    count++;
  }

  return count;
}

export async function personalizeConfig(
  destination: string,
  opts: {
    parentAccount: string;
    parentGateway: string;
    name?: string;
    domain?: string;
    workspaceOpts?: { localOverrides?: boolean; sourceDir?: string };
  },
): Promise<void> {
  const configPath = join(destination, "bos.config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;

    config.extends = `bos://${opts.parentAccount}/${opts.parentGateway}`;

    if (opts.name) {
      config.account = opts.name;
    }
    if (opts.domain) {
      config.domain = opts.domain;
    }

    if (config.app && typeof config.app === "object") {
      const app = config.app as Record<string, unknown>;
      for (const entryKey of Object.keys(app)) {
        const entry = app[entryKey];
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          delete e.production;
          delete e.productionIntegrity;
          delete e.ssr;
          delete e.ssrIntegrity;
        }
      }
    }

    if (config.plugins && typeof config.plugins === "object") {
      const plugins = config.plugins as Record<string, unknown>;
      for (const pluginKey of Object.keys(plugins)) {
        const plugin = plugins[pluginKey];
        if (plugin && typeof plugin === "object") {
          const p = plugin as Record<string, unknown>;
          delete p.production;
          delete p.productionIntegrity;
        }
      }
    }

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  const pkgPath = join(destination, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;

    if (pkg.workspaces && typeof pkg.workspaces === "object") {
      const ws = pkg.workspaces as { packages?: string[] };
      if (Array.isArray(ws.packages)) {
        ws.packages = ws.packages.filter((p: string) => p !== "host" && !p.startsWith("packages/"));
      }
    }

    if (pkg.scripts && typeof pkg.scripts === "object") {
      const scripts = pkg.scripts as Record<string, string>;
      const rewrite = (key: string, from: string, to: string) => {
        if (scripts[key]?.includes(from)) {
          scripts[key] = scripts[key].replaceAll(from, to);
        }
      };
      rewrite("dev", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("dev:ui", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("dev:api", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("dev:proxy", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("build", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("deploy", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("publish", "packages/everything-dev/cli.js", "node_modules/.bin/bos");
      rewrite("start", "packages/everything-dev/cli.js", "node_modules/.bin/bos");

      if (scripts["sync:api-contract"]) {
        delete scripts["sync:api-contract"];
      }
      if (scripts.postinstall) {
        delete scripts.postinstall;
      }
      if (scripts.typecheck?.includes("sync:api-contract")) {
        scripts.typecheck = scripts.typecheck.replace("bun run sync:api-contract && ", "");
      }
    }

    if (pkg.devDependencies && typeof pkg.devDependencies === "object") {
      const deps = pkg.devDependencies as Record<string, string>;
      delete deps["every-plugin"];
      delete deps["everything-dev"];
    }

    if (!pkg.dependencies) pkg.dependencies = {};
    const deps = pkg.dependencies as Record<string, string>;
    if (!deps["everything-dev"]) deps["everything-dev"] = "^1.1.0";
    if (!deps["every-plugin"]) deps["every-plugin"] = "^2.0.0";

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  await resolveWorkspaceRefs(destination, opts.workspaceOpts);
}

export async function runBunInstall(destination: string): Promise<void> {
  await execCommand("bun", ["install"], destination);
}

const WORKSPACE_VERSION_MAP: Record<string, string> = {
  "everything-dev": "^1.1.0",
  "every-plugin": "^2.0.0",
};

const WORKSPACE_LOCAL_PATHS: Record<string, string> = {
  "everything-dev": "packages/everything-dev",
  "every-plugin": "packages/every-plugin",
};

async function resolveWorkspaceRefs(
  destination: string,
  options?: { localOverrides?: boolean; sourceDir?: string },
): Promise<void> {
  const files = await glob("**/package.json", {
    cwd: destination,
    nodir: true,
    dot: false,
    absolute: false,
    ignore: ["**/node_modules/**"],
  });

  for (const file of files) {
    const filePath = join(destination, file);
    const content = readFileSync(filePath, "utf-8");
    if (!content.includes("workspace:")) continue;

    const pkg = JSON.parse(content) as Record<string, unknown>;
    let modified = false;

    for (const depField of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[depField];
      if (!deps || typeof deps !== "object") continue;
      const map = deps as Record<string, string>;
      for (const [name, version] of Object.entries(map)) {
        if (version === "workspace:*") {
          const resolved = WORKSPACE_VERSION_MAP[name];
          if (resolved) {
            map[name] = resolved;
            modified = true;
          } else if (name === "host") {
            delete map[name];
            modified = true;
          }
        }
      }
    }

    if (modified) {
      writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }

  if (options?.localOverrides && options.sourceDir) {
    const rootPkgPath = join(destination, "package.json");
    if (existsSync(rootPkgPath)) {
      const pkg = JSON.parse(readFileSync(rootPkgPath, "utf-8")) as Record<string, unknown>;
      if (!pkg.overrides) pkg.overrides = {};
      const overrides = pkg.overrides as Record<string, string>;

      const rootWorkspaces = ((pkg.workspaces as Record<string, string[]>)?.packages ?? []).filter(
        Boolean,
      );

      for (const [name, relPath] of Object.entries(WORKSPACE_LOCAL_PATHS)) {
        if (!rootWorkspaces.some((ws) => ws === relPath || ws === `plugins/${name}`)) {
          const srcPkgPath = join(options.sourceDir, relPath, "package.json");
          if (existsSync(srcPkgPath)) {
            overrides[name] = `file:${relPath}`;
            rootWorkspaces.push(relPath);
          }
        }
      }

      if (rootWorkspaces.length > 0) {
        if (!pkg.workspaces) pkg.workspaces = {};
        (pkg.workspaces as Record<string, string[]>).packages = rootWorkspaces;
      }

      writeFileSync(rootPkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
}

function mkTmpDir(prefix: string): string {
  const base = join(tmpdir(), prefix);
  let attempt = 0;
  while (true) {
    const dir = `${base}-${Date.now()}-${attempt}`;
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      attempt++;
      if (attempt > 10) throw new Error("Failed to create temp directory");
    }
  }
}

function execCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "pipe",
      shell: true,
    });
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Command '${command} ${args.join(" ")}' failed with exit code ${code}: ${stderr}`,
          ),
        );
    });
    child.on("error", reject);
  });
}

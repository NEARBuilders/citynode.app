import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
import {
  loadManifestNormalizationSpec,
  normalizePackageManifestsInTree,
} from "../internal/manifest-normalizer";
import type { BosConfig } from "../types";
import { writeSnapshot } from "./snapshot";

const require = createRequire(import.meta.url);

const BOS_CONFIG_ORDER = [
  "extends",
  "account",
  "domain",
  "testnet",
  "staging",
  "repository",
  "app",
  "plugins",
  "shared",
];

function rebuildOrderedConfig(config: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  for (const key of BOS_CONFIG_ORDER) {
    if (key in config) {
      ordered[key] = config[key];
    }
  }

  for (const key of Object.keys(config)) {
    if (!BOS_CONFIG_ORDER.includes(key)) {
      ordered[key] = config[key];
    }
  }

  return ordered;
}

interface SourceResult {
  sourceDir: string;
  parentConfig: BosConfig;
  cleanup: () => Promise<void>;
}

export async function resolveSourceDir(opts: {
  extendsAccount: string;
  extendsGateway: string;
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

  const parentConfig = await fetchParentConfig(opts.extendsAccount, opts.extendsGateway);

  if (!parentConfig.repository) {
    throw new Error("Parent config has no repository field — cannot locate template source");
  }

  const { dir: sourceDir, cleanup } = await downloadTarball(parentConfig.repository);
  return { sourceDir, parentConfig, cleanup };
}

export async function fetchParentConfig(
  extendsAccount: string,
  extendsGateway: string,
): Promise<BosConfig> {
  const bosUrl = `bos://${extendsAccount}/${extendsGateway}`;
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
  options: { withHost: boolean; plugins?: string[]; pluginRoutes?: Record<string, string[]> },
): Promise<number> {
  if (patterns.length === 0) {
    return 0;
  }

  const effectivePatterns = options.withHost
    ? [...patterns, "host/**"]
    : patterns.filter((p) => !p.startsWith("host/") && p !== "host/**");

  const filteredPatterns = effectivePatterns.filter((p) => {
    const pluginMatch = p.match(/^plugins\/([^/]+)/);
    if (!pluginMatch) return true;
    const pluginName = pluginMatch[1];
    return options.plugins?.includes(pluginName) ?? true;
  });

  const excludedRoutePatterns: string[] = [];
  if (options.pluginRoutes) {
    for (const [pluginKey, routePatterns] of Object.entries(options.pluginRoutes)) {
      if (!(options.plugins?.includes(pluginKey) ?? true)) {
        excludedRoutePatterns.push(...routePatterns);
      }
    }
  }

  const allFiles = new Set<string>();
  for (const pattern of filteredPatterns) {
    const matches = await glob(pattern, {
      cwd: sourceDir,
      nodir: true,
      dot: true,
      absolute: false,
    });
    for (const match of matches) {
      const pluginMatch = match.match(/^plugins\/([^/]+)/);
      if (pluginMatch) {
        const pluginName = pluginMatch[1];
        if (!(options.plugins?.includes(pluginName) ?? true)) continue;
      }
      if (isRouteExcluded(match, excludedRoutePatterns)) continue;
      allFiles.add(match);
    }
  }

  const routeFiles = new Set<string>();
  if (options.pluginRoutes) {
    for (const [pluginKey, routePatterns] of Object.entries(options.pluginRoutes)) {
      if (!(options.plugins?.includes(pluginKey) ?? true)) continue;
      for (const rp of routePatterns) {
        const matches = await glob(rp, {
          cwd: sourceDir,
          nodir: true,
          dot: true,
          absolute: false,
        });
        for (const match of matches) {
          if (!isRouteExcluded(match, excludedRoutePatterns)) {
            routeFiles.add(match);
          }
        }
      }
    }
  }

  for (const f of routeFiles) allFiles.add(f);

  mkdirSync(destination, { recursive: true });

  let count = 0;
  for (const filePath of allFiles) {
    const src = join(sourceDir, filePath);
    const stat = lstatSync(src);
    if (!stat.isFile()) continue;

    const destPath = filePath.startsWith(".github/templates/")
      ? filePath.replace(/^\.github\/templates\//, ".github/")
      : filePath;
    const dest = join(destination, destPath);
    mkdirSync(dirname(dest), { recursive: true });
    const content = readFileSync(src);
    writeFileSync(dest, content);
    count++;
  }

  return count;
}

function isRouteExcluded(filePath: string, excludedPatterns: string[]): boolean {
  if (excludedPatterns.length === 0) return false;
  for (const pattern of excludedPatterns) {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (filePath.startsWith(`${prefix}/`) || filePath === prefix) return true;
    } else if (filePath === pattern || filePath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}

export async function personalizeConfig(
  destination: string,
  opts: {
    extendsAccount: string;
    extendsGateway: string;
    account?: string;
    domain?: string;
    plugins?: string[];
    pluginRoutes?: Record<string, string[]>;
    workspaceOpts?: { localOverrides?: boolean; sourceDir?: string };
    mode?: "init" | "sync";
    withHost?: boolean;
  },
): Promise<void> {
  const isInit = opts.mode !== "sync";
  const configPath = join(destination, "bos.config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;

    config.extends = `bos://${opts.extendsAccount}/${opts.extendsGateway}`;

    if (opts.account) {
      config.account = opts.account;
    }
    if (opts.domain) {
      config.domain = opts.domain;
    }

    if (isInit && config.app && typeof config.app === "object") {
      const app = config.app as Record<string, unknown>;

      for (const entryKey of Object.keys(app)) {
        const entry = app[entryKey];
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          delete e.production;
          delete e.integrity;
          delete e.ssr;
          delete e.ssrIntegrity;
        }
      }
    }

    if (config.plugins && typeof config.plugins === "object") {
      const plugins = config.plugins as Record<string, unknown>;

      if (opts.plugins && opts.plugins.length > 0) {
        for (const pluginKey of Object.keys(plugins)) {
          if (!opts.plugins.includes(pluginKey)) {
            delete plugins[pluginKey];
          }
        }
      }

      if (isInit) {
        for (const pluginKey of Object.keys(plugins)) {
          const plugin = plugins[pluginKey];
          if (plugin && typeof plugin === "object") {
            const p = plugin as Record<string, unknown>;
            delete p.production;
            delete p.integrity;
          }
        }
      }

      if (Object.keys(plugins).length === 0) {
        config.plugins = {};
      }
    }

    writeFileSync(configPath, `${JSON.stringify(rebuildOrderedConfig(config), null, 2)}\n`);
  }

  const pkgPath = join(destination, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;

    if (pkg.workspaces && typeof pkg.workspaces === "object") {
      const ws = pkg.workspaces as { packages?: string[] };
      if (Array.isArray(ws.packages)) {
        ws.packages = ws.packages.filter((p: string) => {
          if (p.startsWith("packages/")) return false;
          if (p === "host") return opts.withHost ?? false;
          if (p === "plugins/*") return (opts.plugins?.length ?? 0) > 0;
          const pluginMatch = p.match(/^plugins\/([^/]+)/);
          if (pluginMatch) return opts.plugins?.includes(pluginMatch[1]) ?? true;
          return true;
        });
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

      scripts.postinstall = "node_modules/.bin/bos types gen || true";
      scripts["types:gen"] = "node_modules/.bin/bos types gen";
      if (scripts.typecheck) {
        scripts.typecheck = scripts.typecheck
          .replace("bun run types:gen && ", "")
          .replace(/bun run --cwd packages\/everything-dev typecheck & ?/, "");
        if (!opts.withHost) {
          scripts.typecheck = scripts.typecheck.replace(/bun run --cwd host tsc --noEmit & ?/, "");
        }
      }
    }

    if (pkg.devDependencies && typeof pkg.devDependencies === "object") {
      const deps = pkg.devDependencies as Record<string, string>;
      delete deps["every-plugin"];
      delete deps["everything-dev"];
    }

    if (!pkg.workspaces || typeof pkg.workspaces !== "object") {
      pkg.workspaces = { packages: [], catalog: {} };
    }
    const workspaces = pkg.workspaces as { packages?: string[]; catalog?: Record<string, string> };
    if (!workspaces.catalog || typeof workspaces.catalog !== "object") {
      workspaces.catalog = {};
    }

    if (!pkg.dependencies) pkg.dependencies = {};
    const deps = pkg.dependencies as Record<string, string>;
    const spec = opts.workspaceOpts?.sourceDir
      ? loadManifestNormalizationSpec(opts.workspaceOpts.sourceDir)
      : null;
    if (spec) {
      workspaces.catalog["everything-dev"] = spec.rootCatalog["everything-dev"];
      workspaces.catalog["every-plugin"] = spec.rootCatalog["every-plugin"];
    }
    if (!deps["everything-dev"] && spec) deps["everything-dev"] = "catalog:";
    if (!deps["every-plugin"] && spec) deps["every-plugin"] = "catalog:";

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const apiTsConfigPath = join(destination, "api", "tsconfig.json");
  if (existsSync(apiTsConfigPath)) {
    const apiTsConfig = JSON.parse(readFileSync(apiTsConfigPath, "utf-8")) as {
      files?: string[];
      [key: string]: unknown;
    };
    if (apiTsConfig.files) {
      const validFiles = apiTsConfig.files.filter((f) => existsSync(join(destination, "api", f)));
      if (validFiles.length !== apiTsConfig.files.length) {
        if (validFiles.length === 0) {
          delete apiTsConfig.files;
        } else {
          apiTsConfig.files = validFiles;
        }
        writeFileSync(apiTsConfigPath, `${JSON.stringify(apiTsConfig, null, 2)}\n`);
      }
    }
  }

  await resolveWorkspaceRefs(destination, opts.workspaceOpts);

  const genContractPath = join(destination, "ui", "src", "lib", "api-types.gen.ts");
  if (!existsSync(genContractPath)) {
    mkdirSync(dirname(genContractPath), { recursive: true });
    writeFileSync(genContractPath, `export type ApiContract = Record<string, never>;\n`);
  }

  const pluginsClientGenPath = join(destination, "api", "src", "lib", "plugins-types.gen.ts");
  if (!existsSync(pluginsClientGenPath)) {
    mkdirSync(dirname(pluginsClientGenPath), { recursive: true });
    writeFileSync(
      pluginsClientGenPath,
      `import type { ContractRouterClient, AnyContractRouter } from "@orpc/contract";\ntype ClientFactory<C extends AnyContractRouter> = (context?: Record<string, unknown>) => ContractRouterClient<C>;\nexport type PluginsClient = Record<string, never>;\n`,
    );
  }

  const authTypesGenPath = join(destination, "ui", "src", "lib", "auth-types.gen.ts");
  if (!existsSync(authTypesGenPath)) {
    mkdirSync(dirname(authTypesGenPath), { recursive: true });
    writeFileSync(
      authTypesGenPath,
      `import type { Auth } from "better-auth";\nexport type { Auth } from "better-auth";\nexport type AuthSessionUser = NonNullable<Auth["$Infer"]["Session"]["user"]> & {\n  role?: string | null;\n  isAnonymous?: boolean | null;\n  walletAddress?: string | null;\n  banned?: boolean | null;\n};\nexport type AuthSessionData = NonNullable<Auth["$Infer"]["Session"]["session"]> & {\n  activeOrganizationId?: string | null;\n};\nexport type AuthSession = {\n  user: AuthSessionUser | null;\n  session: AuthSessionData | null;\n};\nexport interface AuthOrganizationContext {\n  activeOrganizationId: string | null;\n  organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: Record<string, unknown> } | null;\n  member: { id: string; role: string } | null;\n  isPersonal: boolean;\n  hasOrganization: boolean;\n}\nexport interface AuthRequestContext {\n  user: AuthSessionUser | null;\n  userId: string | null;\n  isAuthenticated: boolean;\n  authMethod: "session" | "apiKey" | "anonymous" | "none";\n  near: {\n    primaryAccountId: string | null;\n    linkedAccounts: Array<{ accountId: string; network: string; publicKey: string; isPrimary: boolean }>;\n    hasNearAccount: boolean;\n  };\n  organization: AuthOrganizationContext;\n  organizations?: Array<{ id: string; role: string; name?: string; slug?: string }>;\n}\nexport type AuthActiveMember = { id: string | null; role: string | null; organizationId: string | null };\nexport type AuthOrganization = NonNullable<AuthOrganizationContext["organization"]>;\nexport type AuthOrganizationMember = NonNullable<AuthOrganizationContext["member"]>;\nexport type AuthOrganizationSummary = NonNullable<AuthRequestContext["organizations"]>[number];\nexport type AuthBaseSession = Auth["$Infer"]["Session"];\nexport type createAuthInstance = never;\nexport interface AuthServices {\n  auth: Auth;\n  db: unknown;\n  driver: { close(): Promise<void> };\n  handler: (req: Request) => Promise<Response>;\n}\n`,
    );
  }

  const apiAuthTypesGenPath = join(destination, "api", "src", "lib", "auth-types.gen.ts");
  if (!existsSync(apiAuthTypesGenPath)) {
    mkdirSync(dirname(apiAuthTypesGenPath), { recursive: true });
    writeFileSync(
      apiAuthTypesGenPath,
      `import type { Auth } from "better-auth";\nexport type { Auth } from "better-auth";\nexport type AuthSessionUser = NonNullable<Auth["$Infer"]["Session"]["user"]> & {\n  role?: string | null;\n  isAnonymous?: boolean | null;\n  walletAddress?: string | null;\n  banned?: boolean | null;\n};\nexport type AuthSessionData = NonNullable<Auth["$Infer"]["Session"]["session"]> & {\n  activeOrganizationId?: string | null;\n};\nexport type AuthSession = {\n  user: AuthSessionUser | null;\n  session: AuthSessionData | null;\n};\nexport interface AuthOrganizationContext {\n  activeOrganizationId: string | null;\n  organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: Record<string, unknown> } | null;\n  member: { id: string; role: string } | null;\n  isPersonal: boolean;\n  hasOrganization: boolean;\n}\nexport interface AuthRequestContext {\n  user: AuthSessionUser | null;\n  userId: string | null;\n  isAuthenticated: boolean;\n  authMethod: "session" | "apiKey" | "anonymous" | "none";\n  near: {\n    primaryAccountId: string | null;\n    linkedAccounts: Array<{ accountId: string; network: string; publicKey: string; isPrimary: boolean }>;\n    hasNearAccount: boolean;\n  };\n  organization: AuthOrganizationContext;\n  organizations?: Array<{ id: string; role: string; name?: string; slug?: string }>;\n}\nexport type AuthActiveMember = { id: string | null; role: string | null; organizationId: string | null };\nexport type AuthOrganization = NonNullable<AuthOrganizationContext["organization"]>;\nexport type AuthOrganizationMember = NonNullable<AuthOrganizationContext["member"]>;\nexport type AuthOrganizationSummary = NonNullable<AuthRequestContext["organizations"]>[number];\nexport type AuthBaseSession = Auth["$Infer"]["Session"];\nexport type createAuthInstance = never;\nexport interface AuthServices {\n  auth: Auth;\n  db: unknown;\n  driver: { close(): Promise<void> };\n  handler: (req: Request) => Promise<Response>;\n}\n`,
    );
  }

  const hostAuthTypesGenPath = join(destination, "host", "src", "lib", "auth-types.gen.ts");
  if (existsSync(join(destination, "host", "src")) && !existsSync(hostAuthTypesGenPath)) {
    mkdirSync(dirname(hostAuthTypesGenPath), { recursive: true });
    writeFileSync(
      hostAuthTypesGenPath,
      `import type { Auth } from "better-auth";\nexport type { Auth } from "better-auth";\nexport type AuthSessionUser = NonNullable<Auth["$Infer"]["Session"]["user"]> & {\n  role?: string | null;\n  isAnonymous?: boolean | null;\n  walletAddress?: string | null;\n  banned?: boolean | null;\n};\nexport type AuthSessionData = NonNullable<Auth["$Infer"]["Session"]["session"]> & {\n  activeOrganizationId?: string | null;\n};\nexport type AuthSession = {\n  user: AuthSessionUser | null;\n  session: AuthSessionData | null;\n};\nexport interface AuthOrganizationContext {\n  activeOrganizationId: string | null;\n  organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: Record<string, unknown> } | null;\n  member: { id: string; role: string } | null;\n  isPersonal: boolean;\n  hasOrganization: boolean;\n}\nexport interface AuthRequestContext {\n  user: AuthSessionUser | null;\n  userId: string | null;\n  isAuthenticated: boolean;\n  authMethod: "session" | "apiKey" | "anonymous" | "none";\n  near: {\n    primaryAccountId: string | null;\n    linkedAccounts: Array<{ accountId: string; network: string; publicKey: string; isPrimary: boolean }>;\n    hasNearAccount: boolean;\n  };\n  organization: AuthOrganizationContext;\n  organizations?: Array<{ id: string; role: string; name?: string; slug?: string }>;\n}\nexport type AuthActiveMember = { id: string | null; role: string | null; organizationId: string | null };\nexport type AuthOrganization = NonNullable<AuthOrganizationContext["organization"]>;\nexport type AuthOrganizationMember = NonNullable<AuthOrganizationContext["member"]>;\nexport type AuthOrganizationSummary = NonNullable<AuthRequestContext["organizations"]>[number];\nexport type AuthBaseSession = Auth["$Infer"]["Session"];\nexport type createAuthInstance = never;\nexport interface AuthServices {\n  auth: Auth;\n  db: unknown;\n  driver: { close(): Promise<void> };\n  handler: (req: Request) => Promise<Response>;\n}\n`,
    );
  }
}

export async function runBunInstall(destination: string): Promise<void> {
  await execCommand("bun", ["install", "--ignore-scripts"], destination);
}

export async function runTypesGen(destination: string): Promise<void> {
  await execCommand("node_modules/.bin/bos", ["types", "gen"], destination);
}

const WORKSPACE_LOCAL_PATHS: Record<string, string> = {
  "everything-dev": "packages/everything-dev",
  "every-plugin": "packages/every-plugin",
};

async function resolveWorkspaceRefs(
  destination: string,
  options?: { localOverrides?: boolean; sourceDir?: string },
): Promise<void> {
  await normalizePackageManifestsInTree({
    sourceRootDir: options?.sourceDir ?? destination,
    targetDir: destination,
    resolveCatalogRefs: false,
    preserveCatalogRefs: true,
    removeWorkspaceDeps: ["host"],
  });

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

export async function writeInitSnapshot(
  destination: string,
  extendsAccount: string,
  extendsGateway: string,
  sourceDir: string,
  patterns: string[],
  options: { withHost: boolean; plugins?: string[]; pluginRoutes?: Record<string, string[]> },
): Promise<void> {
  const effectivePatterns = options.withHost
    ? [...patterns, "host/**"]
    : patterns.filter((p) => !p.startsWith("host/") && p !== "host/**");

  const excludedRoutePatterns: string[] = [];
  if (options.pluginRoutes) {
    for (const [pluginKey, routePatterns] of Object.entries(options.pluginRoutes)) {
      if (!(options.plugins?.includes(pluginKey) ?? true)) {
        excludedRoutePatterns.push(...routePatterns);
      }
    }
  }

  const allFiles = new Set<string>();
  for (const pattern of effectivePatterns) {
    const matches = await glob(pattern, {
      cwd: sourceDir,
      nodir: true,
      dot: true,
      absolute: false,
    });
    for (const match of matches) {
      const pluginMatch = match.match(/^plugins\/([^/]+)/);
      if (pluginMatch && !(options.plugins?.includes(pluginMatch[1]) ?? true)) continue;
      if (isRouteExcluded(match, excludedRoutePatterns)) continue;
      allFiles.add(match);
    }
  }

  if (options.pluginRoutes) {
    for (const [pluginKey, routePatterns] of Object.entries(options.pluginRoutes)) {
      if (!(options.plugins?.includes(pluginKey) ?? true)) continue;
      for (const rp of routePatterns) {
        const matches = await glob(rp, {
          cwd: sourceDir,
          nodir: true,
          dot: true,
          absolute: false,
        });
        for (const match of matches) {
          if (!isRouteExcluded(match, excludedRoutePatterns)) {
            allFiles.add(match);
          }
        }
      }
    }
  }

  const fileHashes: Record<string, string> = {};
  for (const filePath of allFiles) {
    const src = join(sourceDir, filePath);
    const stat = lstatSync(src);
    if (!stat.isFile()) continue;
    const content = readFileSync(src);
    const destPath = filePath.startsWith(".github/templates/")
      ? filePath.replace(/^\.github\/templates\//, ".github/")
      : filePath;
    fileHashes[destPath] = computeHash(content);
  }

  await writeSnapshot(destination, {
    parentRef: `bos://${extendsAccount}/${extendsGateway}`,
    files: fileHashes,
  });
}

function computeHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
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

export async function generateDatabaseMigrations(destination: string): Promise<void> {
  const drizzleConfigs = await glob("**/drizzle.config.ts", {
    cwd: destination,
    nodir: true,
    dot: false,
    absolute: false,
    ignore: ["**/node_modules/**"],
  });

  for (const configPath of drizzleConfigs) {
    const workspaceDir = dirname(configPath);
    const pkgPath = join(destination, workspaceDir, "package.json");
    if (!existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (!scripts?.["db:generate"]) continue;

    const cwd = join(destination, workspaceDir);
    await execCommand("bun", ["run", "db:generate"], cwd);
  }
}

export function execCommand(command: string, args: string[], cwd?: string): Promise<void> {
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

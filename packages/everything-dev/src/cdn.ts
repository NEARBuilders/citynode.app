import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import process from "node:process";
import { resolveWorkspaceTarget, type WorkspaceTarget } from "./build";
import type { ResolvedDeployConfig } from "./config";
import { applyDeployResults, computeSriHash, type DeployResultEntry } from "./integrity";
import type { BosConfig, RuntimeConfig } from "./types";
import { run } from "./utils/run";
import { colors } from "./utils/theme";

export const ALCHEMY_VERSION = "2.0.0-beta.76";
const ALCHEMY_EFFECT_PLATFORM_VERSION = "^4.0.0-rc.112";

const CONTENT_TYPES: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  map: "application/json",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
};

const SHORT_CACHE_ENTRY_FILES = new Set([
  "remoteentry.js",
  "remoteentry.server.js",
  "mf-manifest.json",
  "plugin.manifest.json",
  "index.html",
]);

export interface CdnDeployEntrySpec {
  file: string;
  urlField: string;
  integrityField: string;
}

export interface CdnWorkspaceTarget {
  key: string;
  kind: "app" | "plugin";
  path: string;
  distDir: string;
  prefix: string;
  entries: CdnDeployEntrySpec[];
}

export function deployEntrySpecs(key: string): CdnDeployEntrySpec[] {
  switch (key) {
    case "host":
      return [
        {
          file: "remoteEntry.js",
          urlField: "app.host.production",
          integrityField: "app.host.integrity",
        },
      ];
    case "ui":
      return [
        {
          file: "remoteEntry.js",
          urlField: "app.ui.production",
          integrityField: "app.ui.integrity",
        },
        {
          file: "remoteEntry.server.js",
          urlField: "app.ui.ssr",
          integrityField: "app.ui.ssrIntegrity",
        },
      ];
    case "api":
      return [
        {
          file: "remoteEntry.js",
          urlField: "app.api.production",
          integrityField: "app.api.integrity",
        },
      ];
    case "auth":
      return [
        {
          file: "remoteEntry.js",
          urlField: "app.auth.production",
          integrityField: "app.auth.integrity",
        },
      ];
    default:
      return [
        {
          file: "remoteEntry.js",
          urlField: `plugins.${key}.production`,
          integrityField: `plugins.${key}.integrity`,
        },
      ];
  }
}

export function resolveWorkspaceCdnTargets(
  bosConfig: BosConfig | null,
  runtimeConfig: RuntimeConfig | null,
  keys: string[],
  configDir: string,
): CdnWorkspaceTarget[] {
  const targets: CdnWorkspaceTarget[] = [];
  for (const key of keys) {
    const resolved: WorkspaceTarget | null = resolveWorkspaceTarget(
      key,
      bosConfig,
      runtimeConfig,
      configDir,
    );
    if (!resolved) continue;
    const distDir = join(resolved.path, "dist");
    if (!existsSync(distDir)) {
      throw new Error(
        `Workspace "${key}" has no dist/ output at ${distDir} — expected after a successful deploy build`,
      );
    }
    targets.push({
      key: resolved.key,
      kind: resolved.kind,
      path: resolved.path,
      distDir,
      prefix: resolved.key,
      entries: deployEntrySpecs(resolved.key),
    });
  }
  return targets;
}

export function objectMetadataFor(key: string): {
  contentType: string;
  cacheControl: string;
} {
  const base = key.split("/").pop() ?? key;
  const lower = base.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const isEntry = SHORT_CACHE_ENTRY_FILES.has(lower);
  const isHashed = isHashedFilename(base);
  const cacheControl = isEntry
    ? "public, max-age=60"
    : isHashed
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";
  return { contentType, cacheControl };
}

export async function collectDistFiles(
  distDir: string,
): Promise<Array<{ key: string; bytes: Buffer }>> {
  const out: Array<{ key: string; bytes: Buffer }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push({
          key: relative(distDir, full).split(sep).join("/"),
          bytes: readFileSync(full),
        });
      }
    }
  };
  walk(distDir);
  return out;
}

export function hashDistDir(distDir: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === ".DS_Store") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const stat = statSync(full);
        hash.update(
          `${relative(distDir, full).split(sep).join("/")}:${stat.size}:${stat.mtimeMs}\n`,
        );
      }
    }
  };
  walk(distDir);
  return hash.digest("hex");
}

function isHashedFilename(base: string): boolean {
  return /[.-][a-f0-9]{8,}\.[a-z0-9]+$/i.test(base) || /^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(base);
}

export function generateAlchemyRun(opts: {
  hostname: string;
  bucket: string;
  zone?: string;
  targets: Array<{ key: string; distDir: string; prefix: string }>;
}): string {
  const workspaces = opts.targets.map((target) => ({
    key: target.key,
    distDir: target.distDir,
    prefix: target.prefix,
    hash: hashDistDir(target.distDir),
  }));
  const zoneField = opts.zone ? `, zone: ${JSON.stringify(opts.zone)}` : "";
  return `import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { collectDistFiles, objectMetadataFor } from "everything-dev/cdn";

const HOSTNAME = ${JSON.stringify(opts.hostname)};
const BUCKET_NAME = ${JSON.stringify(opts.bucket)};
const WORKSPACES = ${JSON.stringify(workspaces, null, 2)};

const bucket = Cloudflare.R2.Bucket("Cdn", {
  name: BUCKET_NAME,
  domains: [{ name: HOSTNAME${zoneField} }],
  cors: [{ allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"] }],
});

const CdnUpload = Alchemy.Action(
  "CdnUpload",
  Effect.gen(function* () {
    const r2 = yield* Cloudflare.R2.ReadWriteBucket(bucket);
    return Effect.fn(function* (input: { key: string; distDir: string; prefix: string; hash: string }) {
      const files = yield* Effect.tryPromise(() => collectDistFiles(input.distDir));
      for (const file of files) {
        const metadata = objectMetadataFor(file.key);
        yield* r2.put(\`\${input.prefix}/\${file.key}\`, file.bytes, {
          httpMetadata: {
            contentType: metadata.contentType,
            cacheControl: metadata.cacheControl,
          },
        });
      }
      return { uploaded: files.length, prefix: input.prefix };
    });
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketLocal)),
);

export default Alchemy.Stack(
  "BosCdn",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    yield* bucket;
    for (const workspace of WORKSPACES) {
      yield* CdnUpload(\`CdnUpload/\${workspace.key}\`, workspace);
    }
    return { hostname: HOSTNAME };
  }),
);
`;
}

export interface AlchemySandbox {
  sandboxDir: string;
  cliPath: string;
}

export async function ensureAlchemySandbox(configDir: string): Promise<AlchemySandbox> {
  const sandboxDir = join(configDir, ".bos", "alchemy");
  const pkgPath = join(sandboxDir, "package.json");
  const cliPath = join(sandboxDir, "node_modules", "alchemy", "bin", "cli.js");
  const packageJson = {
    name: "bos-alchemy",
    private: true,
    dependencies: {
      alchemy: ALCHEMY_VERSION,
      "@effect/platform-bun": ALCHEMY_EFFECT_PLATFORM_VERSION,
      "@effect/platform-node": ALCHEMY_EFFECT_PLATFORM_VERSION,
    },
  };

  let needsInstall = true;
  if (existsSync(pkgPath) && existsSync(cliPath)) {
    try {
      const existing = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: { alchemy?: string };
      };
      needsInstall = existing.dependencies?.alchemy !== ALCHEMY_VERSION;
    } catch {
      needsInstall = true;
    }
  }

  if (needsInstall) {
    console.log(
      `  ${colors.cyan("Alchemy sandbox")} — installing alchemy@${ALCHEMY_VERSION} into .bos/alchemy (one-time)...`,
    );
    mkdirSync(sandboxDir, { recursive: true });
    writeFileSync(pkgPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    const result = await run("bun", ["install"], { cwd: sandboxDir, capture: true });
    if (result?.exitCode !== 0) {
      throw new Error(
        `Failed to install the Alchemy sandbox in ${sandboxDir}:\n${result?.stderr ?? result?.stdout ?? ""}`,
      );
    }
  }

  if (!existsSync(cliPath)) {
    throw new Error(
      `Alchemy sandbox CLI not found at ${cliPath} — run the deploy again to reinstall`,
    );
  }

  return { sandboxDir, cliPath };
}

export function hasAlchemyCredentials(): boolean {
  if (process.env.CLOUDFLARE_API_TOKEN) return true;
  return existsSync(join(homedir(), ".alchemy", "profiles.json"));
}

export function logCloudflareCdnNotice(resolved: ResolvedDeployConfig): void {
  console.log();
  console.log(
    `  ${colors.cyan("Cloudflare CDN deploy")} — bundles upload to R2 at https://${resolved.cloudflare?.hostname}`,
  );
  if (hasAlchemyCredentials()) {
    console.log(colors.dim("  Alchemy credentials detected."));
  } else {
    console.log(
      `  ${colors.yellow("⚠")} No Alchemy credentials detected — run \`bos cdn login\` first (local), or set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (CI).`,
    );
  }
}

export async function runAlchemyLogin(configDir: string): Promise<{
  status: "ok" | "error";
  error?: string;
}> {
  try {
    const sandbox = await ensureAlchemySandbox(configDir);
    console.log(
      `  ${colors.cyan("Alchemy login")} — alchemy@${ALCHEMY_VERSION} OAuth flow (managed by bos):`,
    );
    await run("bun", [sandbox.cliPath, "login"], { cwd: sandbox.sandboxDir });
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deployToCloudflareCdn(opts: {
  configDir: string;
  resolved: ResolvedDeployConfig;
  targets: CdnWorkspaceTarget[];
  stage: string;
}): Promise<string | null> {
  const cloudflare = opts.resolved.cloudflare;
  if (!cloudflare) {
    return "Cloudflare CDN resolved without cloudflare settings";
  }

  let sandbox: AlchemySandbox;
  try {
    sandbox = await ensureAlchemySandbox(opts.configDir);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const runFile = join(sandbox.sandboxDir, "alchemy.run.ts");
  writeFileSync(
    runFile,
    generateAlchemyRun({
      hostname: cloudflare.hostname,
      bucket: cloudflare.bucket,
      zone: cloudflare.zone,
      targets: opts.targets.map((target) => ({
        key: target.key,
        distDir: target.distDir,
        prefix: target.prefix,
      })),
    }),
  );

  const proc = await run(
    "bun",
    [sandbox.cliPath, "deploy", "alchemy.run.ts", "--stage", opts.stage, "--yes"],
    {
      cwd: sandbox.sandboxDir,
      capture: true,
      stdin: "inherit",
      onChunk: (stream, chunk) => {
        if (stream === "stderr") {
          process.stderr.write(chunk);
        } else {
          process.stdout.write(chunk);
        }
      },
    },
  );

  if (proc?.exitCode !== 0) {
    const output = `${proc?.stdout ?? ""}\n${proc?.stderr ?? ""}`.trim();
    const lastLines = output.split("\n").slice(-10).join("\n");
    return `Alchemy deploy failed (exit ${proc?.exitCode}):\n${lastLines}`;
  }

  return null;
}

export function computeCloudflareDeployEntries(
  targets: CdnWorkspaceTarget[],
  hostname: string,
): DeployResultEntry[] {
  const baseUrl = `https://${hostname.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const entries: DeployResultEntry[] = [];
  for (const target of targets) {
    const url = `${baseUrl}/${target.prefix}`;
    for (const spec of target.entries) {
      const filePath = join(target.distDir, spec.file);
      if (!existsSync(filePath)) {
        throw new Error(
          `Missing ${spec.file} in ${target.distDir} — expected after a successful deploy build`,
        );
      }
      entries.push({
        url,
        urlField: spec.urlField,
        integrityField: spec.integrityField,
        integrity: computeSriHash(readFileSync(filePath)),
      });
    }
  }
  return entries;
}

export function applyCloudflareDeployEntries(
  bosConfigPath: string,
  entries: DeployResultEntry[],
): void {
  const config = JSON.parse(readFileSync(bosConfigPath, "utf8")) as Record<string, unknown>;
  const merged = applyDeployResults(config, entries);
  writeFileSync(bosConfigPath, `${JSON.stringify(merged, null, 2)}\n`);
}

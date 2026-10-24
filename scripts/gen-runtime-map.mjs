#!/usr/bin/env node
/**
 * Runtime-map generator — the child-side inventory of the composed runtime.
 *
 * Reads the resolved runtime config, loads every ui source's manifest
 * (local `src/manifest.gen.json`, or the published `<ui>/manifest.gen.json`
 * for remote sources), applies the same core-wins precedence the host's
 * `constructTree` applies at runtime, and emits:
 *
 *   .bos/generated/runtime-map.json   machine/human inventory
 *   ui/src/lib/runtime-map.gen.ts     typed REMOTE_ROUTES union + metadata
 *
 * This is the local implementation behind everything-dev#345 (typesafe `to`
 * spike) and the child counterpart of everything-dev#591 (`bos routes`).
 * It is a *static model* of composition: nav labels are runtime-only (they
 * live in route options, not manifests) and are reported as null.
 *
 * Loud degradation: a remote manifest that can't be fetched is reported as
 * UNRESOLVED and fails the run, so typecheck catches an upstream rename
 * instead of silently shrinking the map. Set BOS_MAP_ALLOW_UNRESOLVED=1 for
 * offline work (the map is still written, with the unresolved sources).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const CORE_UI_KEY = "ui";
const MANIFEST_VERSION = 2;
const FETCH_TIMEOUT_MS = Number(process.env.BOS_MAP_FETCH_TIMEOUT_MS ?? 15_000);

const MOUNT_IDS = new Set(["public", "authenticated", "admin", "org", "team"]);
const MOUNT_ALIASES = {
  auth: "authenticated",
  authed: "authenticated",
  dashboard: "authenticated",
  organization: "org",
};

function resolveMountSegment(segment) {
  return MOUNT_IDS.has(segment) ? segment : (MOUNT_ALIASES[segment] ?? undefined);
}

function joinPath(a, b) {
  const left = a && a !== "/" ? a.replace(/\/+$/, "") : "";
  const right = b && b !== "/" ? b.replace(/^\/+/, "") : "";
  if (!left) return right ? `/${right}` : "/";
  if (!right) return left;
  return `${left}/${right}`;
}

function isHttp(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function localPathOf(value) {
  return typeof value === "string" && value.startsWith("local:") ? value.slice(6) : undefined;
}

function manifestUrlFor(base) {
  return new URL("manifest.gen.json", base.endsWith("/") ? base : `${base}/`).toString();
}

/** Describe a slot without touching the network. */
function describeSource(root, key, kind, slot, unresolved) {
  if (!slot) return null;
  const development = typeof slot.development === "string" ? slot.development : undefined;
  const production = typeof slot.production === "string" ? slot.production : undefined;
  const pin = slot.pin?.manifest;

  const localPath = localPathOf(development);
  if (localPath) {
    const manifestPath = join(root, localPath, "src/manifest.gen.json");
    if (existsSync(manifestPath)) {
      return { key, kind, source: "local", location: localPath, manifestPath, pin };
    }
    const base = isHttp(production) ? production : undefined;
    if (base) {
      return {
        key,
        kind,
        source: "remote",
        location: base,
        manifestUrl: manifestUrlFor(base),
        pin,
        note: `local path "${localPath}" is absent; using the published bundle`,
      };
    }
    unresolved.push({
      key,
      kind,
      reason: `local path "${localPath}" is absent and there is no production target`,
    });
    return null;
  }

  const base = isHttp(development) ? development : isHttp(production) ? production : undefined;
  if (base) {
    return {
      key,
      kind,
      source: "remote",
      location: base,
      manifestUrl: manifestUrlFor(base),
      pin,
    };
  }

  unresolved.push({ key, kind, reason: "no development or production target" });
  return null;
}

function validateManifest(source, manifest) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.routes)) {
    throw new Error(`source "${source.key}": manifest is not a route manifest`);
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(
      `source "${source.key}": manifest version ${manifest.manifestVersion} (expected ${MANIFEST_VERSION})`,
    );
  }
}

/**
 * Static model of every-plugin's `constructTree` precedence: core ui first,
 * then sources by key; core wins route/mount claims, peer collisions throw.
 */
export function composeRuntimeMap(sources) {
  const ordered = [
    ...sources.filter((source) => source.key === CORE_UI_KEY),
    ...sources
      .filter((source) => source.key !== CORE_UI_KEY)
      .sort((a, b) => a.key.localeCompare(b.key)),
  ];

  const mounts = new Map();
  const mountByLayoutId = new Map();
  const shadowed = [];

  for (const source of ordered) {
    for (const record of source.manifest.routes) {
      if (!record.mount) continue;
      const existing = mounts.get(record.mount);
      if (existing) {
        if (existing.key === CORE_UI_KEY && source.key !== CORE_UI_KEY) {
          shadowed.push({
            id: record.id,
            owner: source.key,
            kind: "mount",
            reason: `mount "${record.mount}" is declared by core ui`,
          });
          mountByLayoutId.set(record.id, record.mount);
          continue;
        }
        throw new Error(
          `mount "${record.mount}" declared by multiple sources: "${existing.key}" and "${source.key}"`,
        );
      }
      mounts.set(record.mount, { key: source.key, recordId: record.id });
      mountByLayoutId.set(record.id, record.mount);
    }
  }

  const routes = [];
  const claims = new Map();

  for (const source of ordered) {
    const pending = source.manifest.routes.filter((record) => !record.mount);
    const byId = new Map();
    const shadowedIds = new Set();
    let progressed = true;

    while (pending.length > 0 && progressed) {
      progressed = false;
      for (let index = 0; index < pending.length; index += 1) {
        const record = pending[index];

        let parent;
        if (record.parentId) {
          if (shadowedIds.has(record.parentId)) {
            shadowedIds.add(record.id);
            shadowed.push({
              id: record.id,
              owner: source.key,
              kind: "route",
              reason: `parent "${record.parentId}" is shadowed`,
            });
            pending.splice(index, 1);
            index -= 1;
            progressed = true;
            continue;
          }
          const local = byId.get(record.parentId);
          if (local) {
            parent = {
              fullPath: local.fullPath,
              mount: local.mount,
              key: `${source.key}:${record.parentId}`,
            };
          } else if (mountByLayoutId.has(record.parentId)) {
            const mount = mountByLayoutId.get(record.parentId);
            parent = { fullPath: "", mount, key: `mount:${mount}` };
          } else {
            continue;
          }
        } else {
          const firstSegment = record.id.split("/")[0] ?? "";
          if (!firstSegment.startsWith("_")) {
            throw new Error(`route "${record.id}" in "${source.key}" must live under a mount`);
          }
          const mount = resolveMountSegment(firstSegment.slice(1));
          if (!mount) {
            throw new Error(
              `unknown mount "_${firstSegment.slice(1)}" (route "${record.id}" in "${source.key}")`,
            );
          }
          if (!mounts.has(mount)) {
            throw new Error(
              `mount "${mount}" is not declared by any source (route "${record.id}" in "${source.key}")`,
            );
          }
          parent = { fullPath: "", mount, key: `mount:${mount}` };
        }

        pending.splice(index, 1);
        index -= 1;
        progressed = true;

        const isLayoutRoute = record.type === "layout" || record.path === undefined;
        if (!isLayoutRoute) {
          const siblings = claims.get(parent.key) ?? new Map();
          const claimant = siblings.get(record.path);
          if (claimant) {
            if (source.key !== CORE_UI_KEY && claimant.startsWith(`${CORE_UI_KEY}:`)) {
              shadowedIds.add(record.id);
              shadowed.push({
                id: record.id,
                owner: source.key,
                kind: "route",
                reason: `path "${record.path}" is claimed by "${claimant}"`,
              });
              continue;
            }
            throw new Error(
              `path collision: "${source.key}" route "${record.id}" declares "${record.path}" already claimed by "${claimant}"`,
            );
          }
          siblings.set(record.path, `${source.key}:${record.id}`);
          claims.set(parent.key, siblings);
        }

        const fullPath = joinPath(parent.fullPath, record.path);
        byId.set(record.id, { fullPath, mount: parent.mount });
        routes.push({
          id: record.id,
          owner: source.key,
          mount: parent.mount,
          type: record.type,
          path: record.path ?? null,
          fullPath,
          core: source.key === CORE_UI_KEY,
          nav: null,
        });
      }
    }

    if (pending.length > 0) {
      throw new Error(
        `unresolvable parentage in "${source.key}": ${pending.map((record) => record.id).join(", ")}`,
      );
    }
  }

  return {
    mounts: [...mounts.entries()].map(([id, value]) => ({
      id,
      declaredBy: value.key,
      recordId: value.recordId,
    })),
    routes,
    shadowed,
  };
}

async function fetchManifest(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

function renderTypeScript(map) {
  const remoteRoutes = map.routes
    .filter((route) => !route.core)
    .map((route) => ({
      id: route.id,
      path: route.fullPath,
      mount: route.mount,
      owner: route.owner,
      type: route.type,
    }));
  const json = (value) => JSON.stringify(value, null, 2);

  return `// Generated by scripts/gen-runtime-map.mjs — do not edit.
// Regenerate with \`pnpm run types:gen\`. This is a static model of the
// composed runtime: core ui wins route/mount claims; plugin routes are
// listed below. Nav labels are runtime-only (route options, not manifests).
// See docs/runtime-map.md.

export const RUNTIME_MAP_GENERATED_AT = ${JSON.stringify(map.generatedAt)};
export const RUNTIME_MAP_ENV = ${JSON.stringify(map.env)};

export const RUNTIME_SOURCES = ${json(map.sources)} as const;

/** Routes owned by a plugin/remote ui source (not the core). */
export const REMOTE_ROUTES = ${json(remoteRoutes)} as const;
export type RemoteRoute = (typeof REMOTE_ROUTES)[number];
export type RemotePath = RemoteRoute["path"];

export const RUNTIME_MOUNTS = ${json(map.mounts)} as const;
export const SHADOWED_ROUTES = ${json(map.shadowed)} as const;

export const UNRESOLVED_SOURCES = ${json(map.unresolved)} as const;
export type UnresolvedSource = (typeof UNRESOLVED_SOURCES)[number];
`;
}

async function main() {
  const root = process.cwd();
  const configPath = join(root, ".bos/bos.resolved-config.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `missing ${configPath} — run \`bos types gen\` (or \`pnpm run types:gen\`) first`,
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const unresolved = [];

  const app = config.app ?? {};
  const descriptors = [
    describeSource(root, CORE_UI_KEY, "core", app.ui ?? config.ui, unresolved),
    describeSource(root, "auth", "auth-ui", app.auth?.ui ?? config.auth?.ui, unresolved),
  ];
  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    descriptors.push(describeSource(root, key, "plugin-ui", plugin?.ui, unresolved));
  }

  const sources = [];
  for (const descriptor of descriptors) {
    if (!descriptor) continue;
    if (descriptor.source === "local") {
      descriptor.manifest = JSON.parse(readFileSync(descriptor.manifestPath, "utf8"));
    } else {
      try {
        descriptor.manifest = await fetchManifest(descriptor.manifestUrl);
      } catch (error) {
        unresolved.push({
          key: descriptor.key,
          kind: descriptor.kind,
          reason: `fetch ${descriptor.manifestUrl} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        continue;
      }
    }
    validateManifest(descriptor, descriptor.manifest);
    sources.push(descriptor);
  }

  if (unresolved.length > 0 && process.env.BOS_MAP_ALLOW_UNRESOLVED !== "1") {
    for (const entry of unresolved) {
      console.error(`[runtime-map] UNRESOLVED ${entry.key} (${entry.kind}): ${entry.reason}`);
    }
    throw new Error(
      "runtime map is incomplete — fix the source or set BOS_MAP_ALLOW_UNRESOLVED=1 for offline work",
    );
  }

  const composed = composeRuntimeMap(sources);
  const map = {
    generatedAt: new Date().toISOString(),
    env: config._resolved?.env ?? "unknown",
    platform: config.platform ?? null,
    extends: config.extends ?? null,
    sources: sources.map((source) => ({
      key: source.key,
      kind: source.kind,
      source: source.source,
      location: source.location,
      manifestUrl: source.manifestUrl ?? null,
      pin: source.pin ?? null,
      note: source.note ?? null,
    })),
    unresolved,
    mounts: composed.mounts,
    routes: composed.routes,
    shadowed: composed.shadowed,
  };

  const jsonPath = join(root, ".bos/generated/runtime-map.json");
  const tsPath = join(root, "ui/src/lib/runtime-map.gen.ts");
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(tsPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(map, null, 2)}\n`);
  writeFileSync(tsPath, renderTypeScript(map));

  const remoteCount = map.routes.filter((route) => !route.core).length;
  console.log(
    `[runtime-map] ${map.routes.length} routes (${remoteCount} remote) from ${sources.length} sources`,
  );
  for (const entry of unresolved) {
    console.warn(`[runtime-map] unresolved ${entry.key}: ${entry.reason}`);
  }
  console.log(`[runtime-map] wrote ${jsonPath}`);
  console.log(`[runtime-map] wrote ${tsPath}`);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[runtime-map] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

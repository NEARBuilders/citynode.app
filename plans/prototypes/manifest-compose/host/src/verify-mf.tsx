/**
 * Gates 5 + 7 — the PRODUCTION shape: the host's MF runtime loads remote
 * route-config exposes over HTTP (node-SSR bundles, CJS container, shared
 * singletons negotiating to the host's React), then constructs and renders
 * through the SAME construction code as the disk-resolved dev path.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { createRequestHandler, renderRouterToStream, RouterServer } from "@tanstack/react-router/ssr/server";
import { createInstance } from "@module-federation/enhanced/runtime";
import nodePlugin from "@module-federation/node/runtimePlugin";
import { PluginManifestSchema, type PluginManifest } from "@manifest-compose/shared";
import { constructTree, type HostContext, type PluginResolver } from "./construct";
import { baseApp, tenantApp, APPS } from "../../apps";

const protoRoot = path.resolve(import.meta.dir, "../..");

(globalThis as Record<string, unknown>).React = (await import("react")).default;

// remote SSR entries (prod shape; serve.ts substitutes the CDN in real deploys)
const SSR_ENTRY: Record<string, string> = {
  auth: "http://localhost:4001/remoteEntry.server.js",
  landing: "http://localhost:4002/remoteEntry.server.js",
  "landing-tenant": "http://localhost:4003/remoteEntry.server.js",
};
const mfNameOf = (pluginName: string) => pluginName; // remote name === plugin name

// L1: ONE composition instance per process (ADR 0007 §5)
// The @module-federation/node runtime plugin patches `__webpack_require__.l`
// (script loader) — a global that exists natively in rspack-bundled hosts
// (plan 034's host); in this plain-bun prototype host we seed it.
(globalThis as any).__webpack_require__ = (globalThis as any).__webpack_require__ ?? {};
const instance = createInstance({
  name: "host-ssr-compose",
  remotes: [],
  shared: {
    react: { singleton: true, eager: true, requiredVersion: false },
    "react-dom": { singleton: true, eager: true, requiredVersion: false },
    "@tanstack/react-router": { singleton: true, eager: true, requiredVersion: false },
  },
  plugins: [nodePlugin()],
});

const registered = new Set<string>();
const manifestCache = new Map<string, PluginManifest>();
function registerRemote(mfName: string, entryUrl: string) {
  if (registered.has(mfName)) return;
  instance.registerRemotes([{ name: mfName, entry: entryUrl, alias: mfName }]);
  registered.add(mfName);
}

// Host provides: in a rspack-bundled host (plan 034) these come from the
// build's shared config; a plain-runtime host registers them explicitly.
// #134's prod host is the bundled case — this is the same negotiation,
// provides declared in code.
instance.registerShared({
  react: {
    version: "19.2.4",
    eager: true,
    singleton: true,
    requiredVersion: false,
    get: async () => () => import("react"),
  },
  "react-dom": {
    version: "19.2.4",
    eager: true,
    singleton: true,
    requiredVersion: false,
    get: async () => () => import("react-dom"),
  },
  "@tanstack/react-router": {
    version: "1.170.32",
    eager: true,
    singleton: true,
    requiredVersion: false,
    get: async () => () => import("@tanstack/react-router"),
  },
} as any);

// L1 protocol: resolve the share scope BEFORE each expose load — the #134
// protocol (initializeSharing returns a promises array; Promise.all it).
async function initializeShareScope() {
  const sharing = (instance as any).initializeSharing?.("default");
  if (sharing instanceof Promise) {
    await sharing;
  } else if (Array.isArray(sharing)) {
    await Promise.all(sharing);
  }
}

async function fetchManifest(mfName: string): Promise<PluginManifest> {
  const cached = manifestCache.get(mfName);
  if (cached) return cached;
  const res = await fetch(`${SSR_ENTRY[mfName]!.replace(/\/remoteEntry\.server\.js$/, "")}/manifest.gen.json`);
  if (!res.ok) throw new Error(`manifest fetch failed for ${mfName}: ${res.status}`);
  const manifest = PluginManifestSchema.parse(await res.json());
  manifestCache.set(mfName, manifest);
  return manifest;
}

// ---- MF resolver: the PROD path (loadRemote over HTTP) ----
const mfResolver: PluginResolver = async (entry) => {
  const mfName = mfNameOf(entry.pluginName);
  registerRemote(mfName, SSR_ENTRY[mfName]!);
  await initializeShareScope();
  const mod = (await instance.loadRemote(`${mfName}/routeConfig`, { from: "build" })) as any;
  if (!mod) throw new Error(`loadRemote(${mfName}/routeConfig) returned nothing`);
  const routeConfig = (mod.default ?? mod) as any;
  return { pluginName: entry.pluginName, manifest: await fetchManifest(mfName), routeConfig };
};

// ---- disk resolver: the DEV path (source manifests, no MF) ----
const diskResolver: PluginResolver = async (entry) => {
  const dir = path.join(protoRoot, entry.source.path!);
  const manifest = PluginManifestSchema.parse(
    JSON.parse(readFileSync(path.join(dir, "src/manifest.gen.json"), "utf8")),
  );
  const routeConfig = await import(pathToFileURL(path.join(dir, "src/routeConfig.gen.ts")).href);
  return { pluginName: entry.pluginName, manifest, routeConfig: routeConfig as any };
};

const ANON: HostContext = {};
const ADMIN: HostContext = { user: { id: "u1", name: "Ada", isAdmin: true } };

async function renderPath(
  urlPath: string,
  tree: { rootRoute: any },
  context: HostContext,
): Promise<{ status: number; html: string; location?: string }> {
  const request = new Request(`http://localhost:3000${urlPath}`);
  const handler = createRequestHandler({
    request,
    createRouter: () => createRouter({ routeTree: tree.rootRoute, history: createMemoryHistory(), context }),
  });
  const response = await handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({ request, responseHeaders, router, children: <RouterServer router={router} /> }),
  );
  return {
    status: response.status,
    location: response.headers.get("location") ?? undefined,
    html: await new Response(response.body).text(),
  };
}

const clean = (html: string) => html.replaceAll(/<!-- -->/g, "");

async function main() {
  const results: Array<[string, boolean, string]> = [];
  const check = async (name: string, run: () => Promise<string | false>) => {
    try {
      const detail = await run();
      results.push([name, detail !== false, detail === false ? "FAILED" : detail]);
    } catch (err) {
      results.push([name, false, `threw: ${(err as Error).message}`]);
    }
  };

  const base = await constructTree(baseApp, mfResolver);
  const tenant = await constructTree(tenantApp, mfResolver);

  await check("gate5: MF loads route-configs over HTTP; SSR renders / (no two-React crash)", async () => {
    const r = await renderPath("/", base, ANON);
    const t = clean(r.html);
    return t.includes("Landing index — BASE landing plugin") && t.includes("[landing:public]") ? "ok" : false;
  });
  await check("gate5: /login renders through the auth remote (host gate attached)", async () => {
    const r = await renderPath("/login", base, ANON);
    return clean(r.html).includes("Login (auth plugin)") ? "ok" : false;
  });
  await check("gate5: admin /settings/api-keys renders through MF (loader data in HTML)", async () => {
    const r = await renderPath("/settings/api-keys", base, ADMIN);
    return clean(r.html).includes("edk_demo") ? "ok" : false;
  });
  await check("gate5: host-attached gate blocks anon /settings (307 → /login)", async () => {
    const r = await renderPath("/settings", base, ANON);
    return r.status >= 300 && r.status < 400 ? `ok (${r.status})` : false;
  });
  await check("gate5: MF tenant swap renders TENANT landing at /", async () => {
    const r = await renderPath("/", tenant, ANON);
    const t = clean(r.html);
    return t.includes("TENANT landing plugin") ? "ok" : false;
  });
  await check("gate7: MF-resolved and disk-resolved compositions render IDENTICAL HTML", async () => {
    const diskTree = await constructTree(APPS.base, diskResolver);
    for (const [p, ctx] of [
      ["/", ANON],
      ["/login", ANON],
      ["/settings/api-keys", ADMIN],
    ] as const) {
      const a = clean(await renderPath(p, base, ctx).then((r) => r.html));
      const b = clean(await renderPath(p, diskTree, ctx).then((r) => r.html));
      if (a !== b) return false;
    }
    return "ok (/, /login, /settings/api-keys identical)";
  });

  let failures = 0;
  console.log("=== manifest-compose prototype — MF (production-shape) gates ===");
  for (const [name, ok, detail] of results) {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}  ${ok ? "— " + detail : ""}`);
  }
  console.log(`\n=== RESULT: ${failures === 0 ? `PASS — ${results.length}/${results.length}` : `${failures} FAILURES`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-mf crashed:", err);
  process.exit(1);
});

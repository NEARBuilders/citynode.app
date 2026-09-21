/**
 * Bundled-host server — the production shape for gates 5/7: the host is
 * rspack-built with the MF host plugin (build-level share provides via the
 * global build runtime), loads remote route-configs over HTTP, constructs
 * the tree with the SAME construction code as the disk path, health-checks
 * at boot (fail-loud, ADR 0007 §2), then serves SSR.
 *
 * Build:  bunx rsbuild build
 * Run:    node dist/static/js/index.js   (APP=base|tenant PORT=3000)
 */
import path from "node:path";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { createRequestHandler, renderRouterToStream, RouterServer } from "@tanstack/react-router/ssr/server";
import { loadRemote, registerRemotes } from "@module-federation/enhanced/runtime";
import { PluginManifestSchema, type PluginManifest } from "@manifest-compose/shared";
import { constructTree, type HostContext, type PluginResolver } from "./construct";
import { baseApp, tenantApp, APPS, type AppKey } from "../../apps";

// L1: the BUILD runtime instance (native share scope from the build's shared
// config) via the global API — one process, one scope (ADR 0007 §5).
const instance = (globalThis as any).__FEDERATION__.__INSTANCES__?.[0];

// remote SSR entries (serve.ts substitutes the CDN in real deploys)
const SSR_ENTRY: Record<string, string> = {
  auth: "http://localhost:4001/remoteEntry.server.js",
  landing: "http://localhost:4002/remoteEntry.server.js",
  landingTenant: "http://localhost:4003/remoteEntry.server.js",
};

const registered = new Map<string, string>();
function registerRemoteOnce(mfName: string, entryUrl: string) {
  if (registered.get(mfName) === entryUrl) return;
  registerRemotes([{ name: mfName, entry: entryUrl, alias: mfName }]);
  registered.set(mfName, entryUrl);
}

// share scope before each load (the #134 protocol)
async function initializeShareScope() {
  const sharing = instance?.initializeSharing?.("default");
  if (sharing instanceof Promise) await sharing;
  else if (Array.isArray(sharing)) await Promise.all(sharing);
}

const manifestCache = new Map<string, PluginManifest>();
async function fetchManifest(mfName: string, entryUrl: string): Promise<PluginManifest> {
  const cached = manifestCache.get(mfName);
  if (cached) return cached;
  const res = await fetch(`${entryUrl.replace(/\/remoteEntry\.server\.js$/, "")}/manifest.gen.json`);
  if (!res.ok) throw new Error(`manifest fetch failed for ${mfName}: ${res.status}`);
  const manifest = PluginManifestSchema.parse(await res.json());
  manifestCache.set(mfName, manifest);
  return manifest;
}

// MF resolver: the PROD path — expose load over HTTP
const mfResolver: PluginResolver = async (entry) => {
  // tenant swap: the "landing" plugin re-pointed at the tenant remote
  const isTenantLanding = entry.source.path?.includes("landing-tenant");
  const mfName = isTenantLanding ? "landingTenant" : entry.pluginName;
  const entryUrl = SSR_ENTRY[mfName]!;
  registerRemoteOnce(mfName, entryUrl);
  await initializeShareScope();
  const mod = (await loadRemote(`${mfName}/routeConfig`, { from: "build" })) as any;
  if (!mod) throw new Error(`loadRemote(${mfName}/routeConfig) returned nothing`);
  const routeConfig = (mod.default ?? mod) as any;
  return { pluginName: entry.pluginName, manifest: await fetchManifest(mfName, entryUrl), routeConfig };
};

const ANON: HostContext = {};
const ADMIN: HostContext = { user: { id: "u1", name: "Ada", isAdmin: true } };

async function renderPath(urlPath: string, tree: { rootRoute: any }, context: HostContext) {
  const request = new Request(`http://localhost:3000${urlPath}`);
  const handler = createRequestHandler({
    request,
    createRouter: () => createRouter({ routeTree: tree.rootRoute, history: createMemoryHistory(), context }),
  });
  return await handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({ request, responseHeaders, router, children: <RouterServer router={router} /> }),
  );
}

const clean = (html: string) => html.replaceAll(/<!-- -->/g, "");

// ---- fail-loud boot health gate (ADR 0007 §2), then serve ----
const port = Number(process.env.PORT || 3000);
const appKey = (process.env.APP || "base") as AppKey;

const CASES: Array<{ path: string; ctx: HostContext; expect?: string; status?: number }> = [
  { path: "/", ctx: ANON, expect: appKey === "tenant" ? "TENANT landing plugin" : "Landing index — BASE landing plugin" },
  { path: "/login", ctx: ANON, expect: "Login (auth plugin)" },
  { path: "/settings", ctx: ANON, status: 307 },
  { path: "/settings/api-keys", ctx: ADMIN, expect: "edk_demo" },
];

const tree = await composedTreeFor(appKey);
console.log(`[server] app="${appKey}" composed ${tree.manifests.length} plugin(s), digest=${tree.digest}`);

let failures = 0;
for (const c of CASES) {
  try {
    const raw = await renderPath(c.path, tree, c.ctx);
    const html = await new Response(raw.body).text();
    const ok = c.expect ? clean(html).includes(c.expect) : raw.status === c.status;
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.path}  ${c.expect ? `contains "${c.expect}"` : `→ ${raw.status}`}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${c.path}  threw: ${(err as Error).message}`);
  }
}
if (failures > 0) {
  console.error(`[server] BOOT HEALTH CHECK FAILED (${failures}) — unhealthy (ADR 0007 §2)`);
  process.exit(1);
}
console.log("[server] health gate passed");

async function composedTreeFor(key: AppKey) {
  return await constructTree(APPS[key], mfResolver);
}

Bun.serve({
  port,
  async fetch(req) {
    const response = await renderPath(new URL(req.url).pathname, tree, sessionFor(req));
    if (response.status >= 300 && response.status < 400) {
      return new Response(null, { status: response.status, headers: response.headers });
    }
    const html = await new Response(response.body).text();
    return new Response(html, { status: response.status, headers: { "content-type": "text/html" } });
  },
});
console.log(`[server] serving http://localhost:${port} — ^C to stop`);

function sessionFor(req: Request): HostContext {
  return new URL(req.url).searchParams.has("admin")
    ? { user: { id: "u1", name: "Ada", isAdmin: true } }
    : {};
}

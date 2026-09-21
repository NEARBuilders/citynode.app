/**
 * Headless gate runner (plan 033) — the deterministic SSR proof:
 * host composes plugin manifests into ITS OWN tree and streams via
 * createRequestHandler + renderRouterToStream. No browser, no MF networking
 * for the disk-resolved path; gate 5/7 (MF) ride the production resolver.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import {
  createRequestHandler,
  renderRouterToStream,
  RouterServer,
} from "@tanstack/react-router/ssr/server";
import { PluginManifestSchema, type PluginManifest } from "@manifest-compose/shared";
import { constructTree, type ConstructedTree, type HostContext } from "./construct";
import { APPS, type AppKey } from "../../apps";

const protoRoot = path.resolve(import.meta.dir, "../..");

// tsx/bun classic-JSX bridging: remote route files import react via the
// workspace — same module graph, one React by construction (ADR 0007 §4).
(globalThis as Record<string, unknown>).React = (await import("react")).default;

// ---- disk resolver: the DEV path (source manifests, no MF) ----
const manifestCache = new Map<string, PluginManifest>();
async function diskResolver(entry: {
  pluginName: string;
  source: { kind: string; path?: string };
}): Promise<{ pluginName: string; manifest: PluginManifest; routeConfig: any }> {
  const dir = path.join(protoRoot, entry.source.path!);
  let manifest = manifestCache.get(dir);
  if (!manifest) {
    const raw = JSON.parse(readFileSync(path.join(dir, "src/manifest.gen.json"), "utf8"));
    manifest = PluginManifestSchema.parse(raw);
    manifestCache.set(dir, manifest);
  }
  const rc = await import(pathToFileURL(path.join(dir, "src/routeConfig.gen.ts")).href);
  return { pluginName: entry.pluginName, manifest, routeConfig: rc };
}

const ANON: HostContext = {};
const ADMIN: HostContext = { user: { id: "u1", name: "Ada", isAdmin: true } };

const treeCache = new Map<string, ConstructedTree>();
async function composedTree(appKey: AppKey): Promise<ConstructedTree> {
  let t = treeCache.get(appKey);
  if (!t) {
    t = await constructTree(APPS[appKey], diskResolver);
    treeCache.set(appKey, t);
  }
  return t;
}

interface RenderResult {
  status: number;
  location?: string;
  html: string;
}

async function renderPath(urlPath: string, tree: ConstructedTree, context: HostContext): Promise<RenderResult> {
  const request = new Request(`http://localhost:3000${urlPath}`);
  const handler = createRequestHandler({
    request,
    createRouter: () =>
      createRouter({
        routeTree: tree.rootRoute as any,
        history: createMemoryHistory(),
        context,
      }),
  });
  const response = await handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  );
  return {
    status: response.status,
    location: response.headers.get("location") ?? undefined,
    html: await new Response(response.body).text(),
  };
}

const clean = (html: string) => html.replaceAll(/<!-- -->/g, "");

type Case = {
  name: string;
  run: () => Promise<string | false>; // false = failure
};

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

  const base = await composedTree("base");
  const tenant = await composedTree("tenant");

  // Gate 2/3: construction + multi-plugin single mount
  await check("gate2: / renders base landing under _public (landing + host chrome)", async () => {
    const r = await renderPath("/", base, ANON);
    const t = clean(r.html);
    return t.includes("Landing index — BASE landing plugin") && t.includes("[landing:public]") ? "ok" : false;
  });
  await check("gate3: /login renders auth plugin under the SAME _public mount", async () => {
    const r = await renderPath("/login", base, ANON);
    const t = clean(r.html);
    return t.includes("Login (auth plugin)") && t.includes("[auth:public]") ? "ok" : false;
  });
  await check("gate3: /docs renders landing docs route", async () => {
    const r = await renderPath("/docs", base, ANON);
    return clean(r.html).includes("Docs (landing plugin)") ? "ok" : false;
  });

  // Gate 2: host-attached gates
  await check("gate2: anon /settings redirects to /login (host session gate)", async () => {
    const r = await renderPath("/settings", base, ANON);
    return r.status >= 300 && r.status < 400 && (r.location?.includes("/login") ?? false)
      ? `ok (${r.status} → ${r.location})`
      : false;
  });
  await check("gate2: admin /settings/api-keys renders (session gate passes, plugin loader runs)", async () => {
    const r = await renderPath("/settings/api-keys", base, ADMIN);
    const t = clean(r.html);
    return t.includes("API keys (auth plugin)") && t.includes("[auth:authenticated]") ? "ok" : false;
  });
  await check("gate2: admin /login redirects to / (plugin route-level reject-authed beforeLoad)", async () => {
    const r = await renderPath("/login", base, ADMIN);
    return r.status >= 300 && r.status < 400 ? `ok (${r.status} → ${r.location})` : false;
  });

  // Gate 4: SSR content + head lifting
  await check("gate4: SSR streams plugin content server-side (loader data hydrated)", async () => {
    const r = await renderPath("/settings/api-keys", base, ADMIN);
    return clean(r.html).includes("edk_demo") ? "ok (loader data in SSR HTML)" : false;
  });
  await check("gate4: __root head lifted — host head() merges plugin metas", async () => {
    const metas = base.rootRoute.options.head?.({})?.meta ?? [];
    const titles = metas.map((m: any) => m?.title).filter(Boolean);
    return titles.includes("Auth Plugin (remote)") && titles.includes("Landing (remote)")
      ? `ok (${titles.join(" | ")})`
      : false;
  });

  // Gate 6: tenant swap — distinct digest, distinct tree
  await check("gate6: tenant swap renders TENANT landing at /", async () => {
    const r = await renderPath("/", tenant, ANON);
    const t = clean(r.html);
    return t.includes("TENANT landing plugin") && t.includes("[landing-tenant:public]") ? "ok" : false;
  });
  await check("gate6: digests differ across apps, stable across re-composition", async () => {
    const baseAgain = await constructTree(APPS.base, diskResolver);
    return base.digest !== tenant.digest && baseAgain.digest === base.digest
      ? `ok (base=${base.digest} tenant=${tenant.digest})`
      : false;
  });
  await check("gate6: tenant app keeps inherited auth plugin working", async () => {
    const r = await renderPath("/login", tenant, ANON);
    return clean(r.html).includes("Login (auth plugin)") ? "ok" : false;
  });

  // determinism: name-ascending plugin order
  await check("construction: manifests composed in name-ascending order", () => {
    const order = base.manifests.map((m) => m.name);
    return order.every((n, i) => i === 0 || order[i - 1]! <= n) ? `ok (${order.join(", ")})` : false;
  });

  // ---- report ----
  let failures = 0;
  console.log("=== manifest-compose prototype gates ===");
  for (const [name, ok, detail] of results) {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}  ${ok ? "— " + detail : ""}`);
  }
  console.log(`\n=== RESULT: ${failures === 0 ? `PASS — ${results.length}/${results.length}` : `${failures} FAILURES`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify crashed:", err);
  process.exit(1);
});

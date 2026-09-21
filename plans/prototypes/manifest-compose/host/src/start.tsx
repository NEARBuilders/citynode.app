/**
 * start.ts — boot the app from the app.ts descriptor (plan 028's contract,
 * prototype slice): import the descriptor → resolve → construct the tree →
 * serve SSR. This is the whole "the app is the authored file" loop with
 * nothing else: no bos.config.json, no FastKV — the descriptor IS the boot
 * input, resolved through the same construction code as production.
 *
 * usage: bun src/start.ts [--app=base|tenant] [--port=3000]
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { createRequestHandler, renderRouterToStream, RouterServer } from "@tanstack/react-router/ssr/server";
import { PluginManifestSchema, type PluginManifest } from "@manifest-compose/shared";
import { constructTree, type ConstructedTree, type HostContext, type PluginResolver } from "./construct";
import { APPS, type AppKey } from "../../apps";

const protoRoot = path.resolve(import.meta.dir, "../..");

(globalThis as Record<string, unknown>).React = (await import("react")).default;

const arg = (name: string, fallback: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1]! : fallback;
};
const appKey = arg("app", "base") as AppKey;
const port = Number(arg("port", "3000"));
if (!APPS[appKey]) {
  console.error(`unknown app "${appKey}" — known: ${Object.keys(APPS).join(", ")}`);
  process.exit(1);
}

// disk resolver (dev) — production swaps in the MF resolver; construction is shared
const manifestCache = new Map<string, PluginManifest>();
const diskResolver: PluginResolver = async (entry) => {
  const dir = path.join(protoRoot, entry.source.path!);
  let manifest = manifestCache.get(dir);
  if (!manifest) {
    manifest = PluginManifestSchema.parse(
      JSON.parse(readFileSync(path.join(dir, "src/manifest.gen.json"), "utf8")),
    );
    manifestCache.set(dir, manifest);
  }
  const rc = await import(pathToFileURL(path.join(dir, "src/routeConfig.gen.ts")).href);
  return { pluginName: entry.pluginName, manifest, routeConfig: rc as any };
};

console.log(`[start] booting from apps.ts → app "${appKey}" (plugins: ${Object.keys(APPS[appKey].plugins).join(", ")})`);
const tree: ConstructedTree = await constructTree(APPS[appKey], diskResolver);
console.log(`[start] composed ${tree.manifests.length} plugin(s), digest=${tree.digest}`);

// fail-loud boot gate (ADR 0007 §2): construction already threw on failure —
// a broken composition never reaches a listening server.

const sessionFor = (_req: Request): HostContext => {
  // prototype auth context: production forwards the session (ui-route-grafting
  // migration C1). `?admin=1` emulates a signed-in admin for manual checks.
  return new URL(_req.url).searchParams.has("admin")
    ? { user: { id: "u1", name: "Ada", isAdmin: true } }
    : {};
};

const server = Bun.serve({
  port,
  async fetch(req) {
    const request = new Request(req.url);
    const handler = createRequestHandler({
      request,
      createRouter: () =>
        createRouter({
          routeTree: tree.rootRoute as any,
          history: createMemoryHistory(),
          context: sessionFor(req),
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
    if (response.status >= 300 && response.status < 400) {
      return new Response(null, { status: response.status, headers: response.headers });
    }
    const html = await new Response(response.body).text();
    const head = tree.rootRoute.options.head?.({})?.meta ?? [];
    const title = head.find((m: any) => m?.title)?.title ?? "app";
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`,
      { status: response.status, headers: { "content-type": "text/html" } },
    );
  },
});

console.log(`[start] serving http://localhost:${port} (digest=${tree.digest}) — ^C to stop`);

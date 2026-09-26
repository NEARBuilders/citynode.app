import { readBundleCache, writeBundleCache } from "everything-dev/bundle-cache";
import type { Context } from "hono";
import type { AuthVariables } from "../lib/auth";
import type { RuntimeConfig } from "../services/config";
import { bundleCacheControl, bundleContentType } from "./bundles";

type HonoEnv = { Variables: AuthVariables };

/**
 * Foreign-namespace proxy + stale-if-error cache (ADR 0011 amendment —
 * the child tier). Mounted after the FS handler: a child runtime stages
 * only its own namespace, so base workspaces resolve here — the handler
 * proxies the owning origin (mapped from the runtime config's slot URLs)
 * and keeps the last-known-good bytes on disk. An origin outage then
 * degrades to stale serving instead of a hard failure. Namespaces whose
 * origin is the runtime's own domain are never proxied (self-loop); they
 * belong to the FS handler or fall through.
 */
export function deriveNamespaceOrigins(config: RuntimeConfig): Map<string, string> {
  const origins = new Map<string, string>();
  const ownDomain = config.domain;

  const consider = (url: string | undefined) => {
    if (!url) return;
    try {
      const parsed = new URL(url);
      const match = /^\/bundles\/([^/]+)\/([^/]+)\//.exec(parsed.pathname);
      if (!match) return;
      if (ownDomain && parsed.host === ownDomain) return;
      origins.set(`${match[1]}/${match[2]}`, parsed.origin);
    } catch {
      // not a bundle URL — skip
    }
  };

  consider(config.host?.remoteUrl);
  consider(config.ui?.url);
  consider(config.api?.url);
  consider(config.auth?.url);
  for (const plugin of Object.values(config.plugins ?? {})) {
    consider(plugin?.url);
  }
  return origins;
}

export function createBundleProxyCacheHandler(input: {
  namespaceOrigins: Map<string, string>;
  cacheDir?: string;
}) {
  return async (c: Context<HonoEnv>, next: () => Promise<void>) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();

    const url = new URL(c.req.url);
    const match = /^\/bundles\/([^/]+)\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (!match) return next();
    const origin = input.namespaceOrigins.get(`${match[1]}/${match[2]}`);
    if (!origin) return next();

    const name = match[3].split("/").pop() ?? "";
    const headers = (): Record<string, string> => ({
      "content-type": bundleContentType(name, c.req.header("accept")),
      "cache-control": bundleCacheControl(name),
    });

    try {
      const response = await fetch(`${origin}${url.pathname}${url.search}`, {
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`origin responded ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (c.req.method !== "HEAD") {
        await writeBundleCache(url.href, new Uint8Array(bytes), { cacheDir: input.cacheDir });
      }
      return new Response(c.req.method === "HEAD" ? null : bytes, {
        status: 200,
        headers: headers(),
      });
    } catch {
      const cached = await readBundleCache(url.href, { cacheDir: input.cacheDir });
      if (cached) {
        return new Response(cached.slice().buffer, {
          status: 200,
          headers: { ...headers(), "x-bundle-cache": "stale" },
        });
      }
      return c.text("Bad Gateway", 502);
    }
  };
}

import { createInstance } from "@module-federation/enhanced/runtime";
import { Effect, Schedule } from "effect";
import { verifySriForUrl } from "everything-dev/integrity";
import type { RouterModule } from "../types";
import type { RuntimeConfig } from "./config";
import { FederationError } from "./errors";

export type { RouterModule };

const ROUTER_MODULE_CACHE_TTL_MS = 5 * 60_000;
const SSR_INTEGRITY_CACHE_TTL_MS = 5 * 60_000;
const PLUGIN_TREE_CACHE_TTL_MS = 5 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 10_000;
const MAX_ROUTER_MODULE_CACHE_SIZE = 128;
const MAX_SSR_INTEGRITY_CACHE_SIZE = 256;
const MAX_PLUGIN_TREE_CACHE_SIZE = 256;
const MAX_MF_INSTANCES = 128;

interface CachedPromise<T> {
  expiresAt: number;
  value: Promise<T>;
}

const routerModuleCache = new Map<string, CachedPromise<RouterModule>>();
const verifiedSsrEntryCache = new Map<string, CachedPromise<void>>();
const pluginTreeCache = new Map<string, CachedPromise<unknown>>();

type ModuleFederationInstance = ReturnType<typeof createInstance>;

/**
 * One MF instance per (remote :: entry :: integrity). Same name → same
 * instance, so retries and repeated loads never mint new ones into the
 * runtime's global instance registry — that registry is append-only inside
 * @module-federation and was the unbounded host memory growth: every failing
 * request used to stack up to six instances that nothing could evict.
 */
const instanceRegistry = new Map<string, ModuleFederationInstance>();

function releaseInstanceRemotes(instance: ModuleFederationInstance | undefined) {
  if (!instance) return;
  try {
    const handler = (
      instance as unknown as {
        remoteHandler?: { removeRemote?: (remote: unknown) => void };
      }
    ).remoteHandler;
    for (const remote of [...instance.options.remotes]) {
      handler?.removeRemote?.(remote);
    }
  } catch {
    // best-effort: the instance was already evicted from the registry, so the
    // worst case is a shallow pin in the runtime's global list.
  }
}

function getOrCreateInstance(
  name: string,
  remote: { name: string; entry: string },
): ModuleFederationInstance {
  const existing = instanceRegistry.get(name);
  if (existing) {
    instanceRegistry.delete(name);
    instanceRegistry.set(name, existing);
    return existing;
  }
  const instance = createInstance({
    name,
    remotes: [{ name: remote.name, entry: remote.entry, alias: remote.name }],
  });
  instanceRegistry.set(name, instance);
  while (instanceRegistry.size > MAX_MF_INSTANCES) {
    const oldestName = instanceRegistry.keys().next().value;
    if (!oldestName) break;
    const evicted = instanceRegistry.get(oldestName);
    instanceRegistry.delete(oldestName);
    releaseInstanceRemotes(evicted);
  }
  return instance;
}

function pruneExpiredCacheEntries<T>(cache: Map<string, CachedPromise<T>>, now: number) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function enforceCacheLimit<T>(cache: Map<string, CachedPromise<T>>, maxSize: number) {
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export function resetFederationInstance() {
  routerModuleCache.clear();
  verifiedSsrEntryCache.clear();
  pluginTreeCache.clear();
  for (const instance of instanceRegistry.values()) {
    releaseInstanceRemotes(instance);
  }
  instanceRegistry.clear();
}

function shouldCacheRouterModule(config: RuntimeConfig) {
  return config.ui.source !== "local" && Boolean(config.ui.ssrIntegrity);
}

async function verifySsrEntryIntegrity(entryUrl: string, expectedIntegrity: string): Promise<void> {
  const cacheKey = `${entryUrl}::${expectedIntegrity}`;
  const now = Date.now();
  pruneExpiredCacheEntries(verifiedSsrEntryCache, now);

  const cached = verifiedSsrEntryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const verification = verifySriForUrl(entryUrl, expectedIntegrity, {
    resolveEntryUrl: false,
  }).catch((error) => {
    verifiedSsrEntryCache.delete(cacheKey);
    throw error;
  });

  verifiedSsrEntryCache.set(cacheKey, {
    value: verification,
    expiresAt: now + SSR_INTEGRITY_CACHE_TTL_MS,
  });
  enforceCacheLimit(verifiedSsrEntryCache, MAX_SSR_INTEGRITY_CACHE_SIZE);
  return verification;
}

function getSsrEntryUrl(config: RuntimeConfig) {
  const isLocalDev = config.ui.source === "local";
  const ssrUrl = config.ui.ssrUrl ?? (isLocalDev ? config.ui.url : undefined);

  if (!ssrUrl) {
    if (!isLocalDev) {
      throw new FederationError({
        remoteName: config.ui.name,
        cause: new Error(
          "SSR URL not configured in production. Set app.ui.ssr in bos.config.json to enable SSR.",
        ),
      });
    }
    throw new Error(
      "SSR URL not configured. In local dev, set app.ui.ssr or use a UI package with SSR support.",
    );
  }

  const entryUrl = `${ssrUrl.replace(/\/$/, "")}/remoteEntry.server.js`;
  if (!isLocalDev && config.ui.ssrIntegrity) {
    return `${entryUrl}?v=${encodeURIComponent(config.ui.ssrIntegrity)}`;
  }

  return entryUrl;
}

const retrySchedule = Schedule.addDelay(Schedule.recurs(5), () => Effect.succeed(500));

interface RemoteModuleLoad<T> {
  cacheKey: string;
  remoteName: string;
  remoteUrl?: string;
  entryUrl: string;
  expose: string;
  cache: Map<string, CachedPromise<T>>;
  ttlMs: number;
  maxSize: number;
  /** bypass the instance registry — uncached loads must always hit the wire (local dev hot reload) */
  freshInstance: boolean;
}

/**
 * Load one expose from a remote's server entry: TTL-capped, retry-bounded,
 * negative-cached on failure, served by a reused MF instance. Failures keep
 * the failing promise cached for NEGATIVE_CACHE_TTL_MS so a downed remote is
 * probed once per window, not once per request.
 */
function loadRemoteExpose<T>(params: RemoteModuleLoad<T>): Promise<T> {
  const { cacheKey, remoteName, expose, cache, ttlMs, maxSize, freshInstance, entryUrl } = params;
  const now = Date.now();
  pruneExpiredCacheEntries(cache, now);

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const mf = freshInstance
    ? createInstance({
        name: `host-uncached-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        remotes: [{ name: remoteName, entry: entryUrl, alias: remoteName }],
      })
    : getOrCreateInstance(`host-${Buffer.from(cacheKey).toString("base64url")}`, {
        name: remoteName,
        entry: entryUrl,
      });

  const value = Effect.runPromise(
    Effect.tryPromise({
      try: () => mf.loadRemote<any>(expose, { from: "build" }),
      catch: (e) => e as Error,
    }).pipe(
      Effect.flatMap((result) =>
        result
          ? Effect.succeed(result.default as T)
          : Effect.fail(new Error(`Module not found: ${expose}`)),
      ),
      Effect.retry(retrySchedule),
    ),
  );

  cache.set(cacheKey, { value, expiresAt: now + ttlMs });
  enforceCacheLimit(cache, maxSize);

  value.catch(() => {
    const current = cache.get(cacheKey);
    if (current?.value === value) {
      cache.set(cacheKey, { value, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
    }
  });

  return value;
}

/**
 * Load an arbitrary expose from a remote's server entry — used for plugin ui
 * `./tree` route-tree exports during SSR composition. Same SRI + TTL + retry
 * machinery as loadRouterModule, keyed per remote.
 */
export interface PluginUiSsrEntry {
  name: string;
  ssrUrl?: string;
  ssrIntegrity?: string;
}

export const loadPluginUiTree = (plugin: PluginUiSsrEntry) =>
  Effect.gen(function* () {
    if (!plugin.ssrUrl) {
      throw new FederationError({
        remoteName: plugin.name,
        cause: new Error(
          `Plugin "${plugin.name}" has a ui surface but no SSR entry URL (plugins.<id>.ui.ssr)`,
        ),
      });
    }
    const entryUrl = `${plugin.ssrUrl.replace(/\/$/, "")}/remoteEntry.server.js`;
    if (plugin.ssrIntegrity) {
      yield* Effect.tryPromise({
        try: () => verifySsrEntryIntegrity(entryUrl, plugin.ssrIntegrity!),
        catch: (e) =>
          new FederationError({
            remoteName: plugin.name,
            remoteUrl: plugin.ssrUrl,
            cause: e instanceof Error ? e : new Error(String(e)),
          }),
      });
    }

    const cacheKey = `${plugin.name}::${entryUrl}::${plugin.ssrIntegrity ?? "no-integrity"}`;
    const tree = yield* Effect.tryPromise({
      try: () =>
        loadRemoteExpose<unknown>({
          cacheKey,
          remoteName: plugin.name,
          remoteUrl: plugin.ssrUrl,
          entryUrl,
          expose: `${plugin.name}/tree`,
          cache: pluginTreeCache,
          ttlMs: PLUGIN_TREE_CACHE_TTL_MS,
          maxSize: MAX_PLUGIN_TREE_CACHE_SIZE,
          freshInstance: false,
        }),
      catch: (e) =>
        new FederationError({
          remoteName: plugin.name,
          remoteUrl: plugin.ssrUrl,
          cause: e,
        }),
    });
    return tree;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.tapError((error: Error) =>
      Effect.logError(`[SSR] Plugin tree ${plugin.name} failed: ${error.message}`),
    ),
  );

export const loadRouterModule = (config: RuntimeConfig) =>
  Effect.gen(function* () {
    const useCache = shouldCacheRouterModule(config);
    const ssrEntryUrl = getSsrEntryUrl(config);

    if (config.ui.ssrIntegrity) {
      yield* Effect.tryPromise({
        try: () => verifySsrEntryIntegrity(ssrEntryUrl, config.ui.ssrIntegrity!),
        catch: (e) =>
          new FederationError({
            remoteName: config.ui.name,
            remoteUrl: config.ui.ssrUrl,
            cause: e instanceof Error ? e : new Error(String(e)),
          }),
      });
    }

    const cacheKey = `${config.ui.name}::${ssrEntryUrl}::${config.ui.ssrIntegrity ?? "no-integrity"}`;

    const loadedModule = yield* Effect.tryPromise({
      try: () =>
        loadRemoteExpose<RouterModule>({
          cacheKey,
          remoteName: config.ui.name,
          remoteUrl: config.ui.ssrUrl,
          entryUrl: ssrEntryUrl,
          expose: `${config.ui.name}/Router`,
          cache: useCache ? routerModuleCache : new Map(),
          ttlMs: ROUTER_MODULE_CACHE_TTL_MS,
          maxSize: MAX_ROUTER_MODULE_CACHE_SIZE,
          freshInstance: !useCache,
        }),
      catch: (e) =>
        new FederationError({
          remoteName: config.ui.name,
          remoteUrl: config.ui.ssrUrl,
          cause: e,
        }),
    });

    return loadedModule;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.tapError((error: Error) => Effect.logError(`[SSR] Failed: ${error.message}`)),
  );

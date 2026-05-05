# Runtime Config Hot-Swap

## Problem

The host freezes `RuntimeConfig` at startup. `ConfigService` is an immutable
`Layer.succeed` — every downstream service (Auth, Plugins, SSR federation, Hono
routes) reads config once during construction. After `bos publish --deploy`
updates CDN URLs in `bos.config.json`, the host must be fully restarted to pick
up changes.

This blocks the "prompt from browser, see it live" workflow: opencode can edit
files and deploy, but the running host keeps serving the old UI and API.

## Goal

Allow a running host to pick up new runtime config without a process restart.
In-flight requests complete on the old config; new requests see the new config.

## Architecture

### Scope-based rebuild with atomic handler swap

The host's Effect services are composed into a `ManagedRuntime` that owns the
full lifecycle (DB connections, plugin runtimes, auth instances). Rather than
making each service individually reactive (which would require wrapping Auth,
Plugins, etc. in `Ref` types), we **swap the entire scope**.

The only mutable state is a single function pointer that delegates HTTP requests
to the currently active scope's Hono app.

```
         ┌──────────────────────────────────────┐
         │      HTTP Server (long-lived)        │
         │  serve({ fetch: (req) =>             │
         │    activeHandler(req)                │
         │  })                                   │
         └──────────────┬───────────────────────┘
                        │
           ┌────────────▼─────────────┐
           │   Scope A (current)       │
           │   ConfigService = cfg:v1 │
           │   DB ← acquireRelease    │
           │   Auth ← betterAuth(v1)  │
           │   Plugins ← runtime(v1) │
           │   Hono app ← all of above│
           └──────────────────────────┘
                    ↕ atomic swap
           ┌─────────────────────────┐
           │   Scope B (new)         │
           │   ConfigService = cfg:v2│
           │   DB ← acquireRelease   │
           │   Auth ← betterAuth(v2) │
           │   Plugins ← runtime(v2) │
           │   Hono app ← all of above│
           └─────────────────────────┘
```

On reload:

1. Build new `ManagedRuntime` with new config → new scope B
2. Wait for scope B ready (DB connected, plugins loaded, health checks pass)
3. Atomically swap `activeHandler` to scope B's `app.fetch`
4. Dispose old scope A (DB close, plugin shutdown, etc.)
5. In-flight requests on scope A complete; new requests go to scope B

### Why not reactive Refs on each service?

| Service | Issue with per-service Refs |
|----------|---------------------------|
| **AuthService** | `betterAuth()` creates internal state (sessions, CSRF, OAuth). Swapping a `Ref<Auth>` mid-flight breaks active sessions. |
| **PluginsService** | `createPluginRuntime()` + `usePlugin()` establish remote connections. Requires graceful teardown. |
| **Hono routes** | Route handlers are closures over `config`, `auth`, `plugins`. You cannot swap values inside closures. |
| **SSR federation** | Module-level singleton `federationInstance` is outside the Effect layer system. |

Swapping the entire scope leverages Effect's existing `ManagedRuntime.dispose()` —
all scoped services (DB, plugins) clean up automatically.

## Two host implementations

There are two host codepaths that need changes:

| File | Purpose | Config source | Approach |
|------|---------|---------------|----------|
| `packages/everything-dev/src/host.ts` | CLI-orchestrated dev mode | `RuntimeConfig` passed directly | Lazy reload of mutable state |
| `host/src/program.ts` + `host/server.ts` | Production Effect-based host | `BOS_RUNTIME_CONFIG` env var | Scope-based rebuild |

### CLI host (`packages/everything-dev/src/host.ts`)

The CLI host already does lazy loading:

- `ensureApiPluginLoaded()` — lazy-loads API plugins on first request
- `ensureRouterModuleLoaded()` — lazy-loads SSR router on first request

For hot-swap, add a `resetState()` function that clears `apiPlugins`,
`baseApiPlugin`, `ssrRouterModule`, `rpcHandler`, `openApiHandler` and lets the
lazy-loading pattern re-fetch from new URLs.

```typescript
function resetState(newConfig: RuntimeConfig) {
  runtimeConfig = newConfig;
  clientRuntimeConfig = buildClientRuntimeConfig(newConfig);
  apiPlugins = [];
  baseApiPlugin = null;
  apiPluginError = null;
  rpcHandler = null;
  openApiHandler = null;
  ssrRouterModule = null;
  ssrRouterError = null;
  ssrRouterLoading = null;
  // Next request triggers lazy reload with new URLs
}
```

### Production host (`host/src/program.ts`)

This is the main refactor. Split `createStartServer` into two parts:

1. `createScopedApp(config: RuntimeConfig)` — builds a complete Effect scope
   (DB, Auth, Plugins, Hono app) and returns `{ app, config, shutdown }`
2. The HTTP server delegates to `activeHandler`, which atomically switches

The outer Hono app (lives for the server's lifetime) owns the reload endpoint.
The scoped Hono app handles all application routes.

## Trigger mechanism

### `POST /api/_reload-config`

```typescript
// On the outer (long-lived) Hono app
outerApp.post("/api/_reload-config", async (c) => {
  // 1. Authenticate via Better Auth session
  const session = await outerAuth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // 2. Check admin role
  if (!session.user.role || session.user.role !== "admin") {
    return c.json({ error: "Forbidden: admin required" }, 403);
  }

  // 3. Get new config
  let newConfig: RuntimeConfig;
  const body = await c.req.json().catch(() => null);

  if (body?.config) {
    // Mode A: config provided in request body
    newConfig = RuntimeConfigSchema.parse(body.config);
  } else {
    // Mode B: re-fetch from FastKV using current account/domain
    const currentConfig = currentScopedApp.config;
    const fetched = await fetchPublishedConfig(currentConfig.account, currentConfig.domain ?? "");
    newConfig = buildRuntimeConfig(fetched);
  }

  // 4. Swap scope
  await reloadWithConfig(newConfig);

  return c.json({
    status: "reloaded",
    accountId: newConfig.account,
    domain: newConfig.domain,
    uiUrl: newConfig.ui?.url,
    apiUrl: newConfig.api?.url,
  });
});
```

### Security model

- **Session-authenticated** — uses the same Better Auth session as every admin endpoint
- **Admin-only** — checks `session.user.role === "admin"`
- **Config validated** — `RuntimeConfigSchema.parse()` validates the entire
  structure before accepting
- **No code execution** — config only changes URLs and string values
- **Same trust boundary as `bos publish`** — publishing to FastKV requires a
  NEAR account key; reloading the host requires an admin session

### Why an HTTP endpoint instead of file watch

1. **Production hosts don't have local `bos.config.json`** — they receive config
   via `BOS_RUNTIME_CONFIG` env var, resolved from FastKV on NEAR
2. **Docker/Kubernetes** — file watchers don't work well in containers where
   config changes come via environment or API calls
3. **Browser-triggerable** — the `/opencode` page can call this endpoint after
   opencode completes a deploy
4. **CLI-triggerable** — `bos publish --deploy` can call it as a post-deploy hook
5. **FastKV re-fetch** — optionally re-fetches the canonical config from the
   blockchain, which is the source of truth

### FastKV re-fetch

The CLI already has `fetchBosConfigFromFastKv()` in
`packages/everything-dev/src/fastkv.ts`. The reload endpoint can reuse this:

```typescript
import { fetchBosConfigFromFastKv } from "everything-dev/fastkv";
import { buildRuntimeConfig } from "everything-dev/config";

async function fetchLatestConfig(currentConfig: RuntimeConfig): Promise<RuntimeConfig> {
  const bosConfig = await fetchBosConfigFromFastKv(
    `bos://${currentConfig.account}/${currentConfig.domain}`
  );
  return buildRuntimeConfig(bosConfig, { env: currentConfig.env });
}
```

This means: anyone publishes to FastKV → admin hits reload → host fetches the
latest canonical config from the blockchain.

## Implementation phases

### Phase 1: Extract `createScopedApp` from `createStartServer`

**File**: `host/src/program.ts`

Split the monolithic `createStartServer` Effect into:

```typescript
// New type
export interface ScopedApp {
  app: Hono;
  config: RuntimeConfig;
  shutdown: () => Promise<void>;
}

// Extracted from createStartServer — builds all services and Hono app
// but does NOT start the HTTP server or call Effect.never
function createScopedApp(config: RuntimeConfig): Effect.Effect<ScopedApp, Error, never> {
  return Effect.gen(function* () {
    const ConfigLive = Layer.succeed(ConfigService, config);
    const ServerLive = Layer.provideMerge(
      Layer.mergeAll(BaseLive, PluginsLive),
      ConfigLive,
    );
    const runtime = ManagedRuntime.make(ServerLive);

    // ... yield all services, build Hono app ...
    // ... same as current createStartServer, minus the server.listen() and Effect.never ...

    return {
      app,
      config,
      shutdown: async () => { await runtime.dispose(); },
    };
  });
}
```

**Complexity**: High (refactoring the 300-line `createStartServer` function)

**No behavior change** — the existing `runServerBlocking` path works identically,
just composing `createScopedApp` + `startServer` instead of one function.

### Phase 2: Mutable handler pattern and reload orchestrator

**File**: `host/src/program.ts`

```typescript
let activeHandler: (req: Request) => Response | Promise<Response>;
let currentScopedApp: ScopedApp | null = null;
let currentShutdown: (() => Promise<void>) | null = null;

async function reloadWithConfig(newConfig: RuntimeConfig) {
  logger.info("[Reload] Starting config swap...");

  // Build new scope
  const newScopedApp = await Effect.runPromise(
    Effect.scoped(createScopedApp(newConfig))
  );

  // Wait for health checks
  // (optional: poll /api/_health on newScopedApp)

  // Atomic swap
  const oldShutdown = currentShutdown;
  activeHandler = (req) => newScopedApp.app.fetch(req);
  currentScopedApp = newScopedApp;
  currentShutdown = () => newScopedApp.shutdown();

  logger.info("[Reload] Handler swapped. Draining old scope.");

  // Dispose old scope (graceful — lets in-flight requests finish)
  if (oldShutdown) {
    await oldShutdown();
  }

  logger.info("[Reload] Complete.");
}
```

The HTTP server becomes:

```typescript
const server = serve({
  fetch: (req) => activeHandler(req),
  port,
  hostname,
});
```

**Complexity**: Medium

### Phase 3: Two-layer Hono app with reload endpoint

**File**: `host/src/program.ts`

```typescript
// Outer app: lives for the HTTP server's lifetime
const outerApp = new Hono();

// Health check on outer app (always available, even during reload)
outerApp.get("/health", (c) => c.text("OK"));

// Reload endpoint on outer app (admin-only)
outerApp.post("/api/_reload-config", reloadHandler);

// Everything else delegates to the scoped app
outerApp.all("/*", (c) => {
  return activeHandler(c.req.raw);
});
```

The reload handler authenticates via Better Auth's `auth.api.getSession()` and
validates the config via `RuntimeConfigSchema`.

**Complexity**: Medium

**Key consideration**: The outer app needs its own auth handler. Since `AuthService`
is inside the scoped app, we need a lightweight auth check on the outer app. The
simplest approach: create a standalone `betterAuth` instance for the reload
endpoint that shares the same DB, or cache the auth instance across reloads.

Alternative: keep a long-lived `auth` reference outside the scope that persists
across reloads. Since DB connections are cheap to acquire, we can create a
separate DB+auth pair just for the reload endpoint.

### Phase 4: Federation instance reset

**File**: `host/src/services/federation.server.ts`

The module-level singleton `federationInstance` must be reset on reload:

```typescript
let federationInstance: ReturnType<typeof createInstance> | null = null;

export function resetFederationInstance() {
  federationInstance = null;
}
```

Called during `reloadWithConfig()` before building the new scope. When the new
scope's SSR loader calls `getOrCreateFederationInstance()`, it creates a fresh
instance with the new UI URLs.

**Complexity**: Low (one function export)

### Phase 5: CLI host reload

**File**: `packages/everything-dev/src/host.ts`

Add `resetState()` function:

```typescript
function resetState(newConfig: RuntimeConfig) {
  runtimeConfig = newConfig;
  clientRuntimeConfig = buildClientRuntimeConfig(newConfig);
  apiPlugins = [];
  baseApiPlugin = null;
  apiPluginError = null;
  rpcHandler = null;
  openApiHandler = null;
  ssrRouterModule = null;
  ssrRouterError = null;
  ssrRouterLoading = null;
}
```

Add the same `/api/_reload-config` endpoint to the CLI host's Hono app.

**Complexity**: Low

### Phase 6: `bos publish --deploy` integration

**File**: `packages/everything-dev/src/plugin.ts`

After `bos publish --deploy` completes (after Zephyr uploads and
`bos.config.json` update), call the reload endpoint:

```typescript
// In the publish handler, after build and deployment succeed:
const hostUrl = runtimeConfig.hostUrl;
try {
  await fetch(`${hostUrl}/api/_reload-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: refreshedRuntimeConfig }),
  });
} catch {
  // Reload failed — host may not be running or admin auth required
  // This is non-blocking; the host will pick up changes on next restart
}
```

**Complexity**: Low (10 lines in the publish handler)

### Phase 7: Browser integration on `/opencode` page

**File**: `ui/src/routes/_layout/opencode.tsx`

Add a "Deploy & Reload" section that describes the workflow:

```tsx
<FactCard
  title="deploy and reload"
  body={
    <>
      After <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
        bos publish --deploy
      </code>{" "}
      uploads new builds to Zephyr CDN, the host can reload without restarting.
      Admin users can call{" "}
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
        POST /api/_reload-config
      </code>{" "}
      to swap in the latest config, or it re-fetches from the NEAR blockchain
      automatically.
    </>
  }
/>
```

Future: a button on the page that triggers deploy via opencode server + reload.

**Complexity**: Low (UI text change)

## Security considerations

| Concern | Mitigation |
|---------|-----------|
| Unauthorized reload | Session cookie + admin role check on `POST /api/_reload-config` |
| Malicious config injection | `RuntimeConfigSchema.parse()` validates the entire structure |
| Config with wrong URLs | New scope health-check before swap; old scope stays if new fails |
| Concurrent reloads | Mutex around `reloadWithConfig()` — only one reload at a time |
| Memory during swap | Old scope disposed immediately after swap; brief 2x memory during transition |
| Active sessions | Better Auth sessions persist in DB; new scope reads same DB; sessions survive reload |
| DB connections | Old scope's DB connection closed in dispose; new scope opens its own |

## File change summary

| File | Change | Phase |
|------|--------|-------|
| `host/src/program.ts` | Extract `createScopedApp`, add mutable handler, add `reloadWithConfig()` | 1, 2 |
| `host/src/program.ts` | Two-layer Hono app with `/api/_reload-config` | 3 |
| `host/src/services/federation.server.ts` | Export `resetFederationInstance()` | 4 |
| `packages/everything-dev/src/host.ts` | Add `resetState()` + `/api/_reload-config` | 5 |
| `packages/everything-dev/src/plugin.ts` | Call reload endpoint after publish | 6 |
| `ui/src/routes/_layout/opencode.tsx` | Add deploy & reload description | 7 |
| `packages/everything-dev/src/fastkv.ts` | Export `fetchBosConfigFromFastKv` if not already | 3 |
| `packages/everything-dev/src/config.ts` | Export `buildRuntimeConfig` if not already | 3 |

## What this enables

**Dev workflow (today):**

```
opencode edits file → HMR at :3002 → see changes instantly
bos publish --deploy → host restart required → new UI live
```

**Dev workflow (after this refactor):**

```
opencode edits file → HMR at :3002 → see changes instantly
bos publish --deploy → POST /api/_reload-config → new UI live without restart
```

**Browser-triggered workflow (future):**

```
/opencode page → prompt opencode server → edit + deploy → reload endpoint → live
```

**Production workflow (Docker/Railway):**

```
bos publish --deploy → FastKV updated → POST /api/_reload-config (empty body)
  → host re-fetches from FastKV → rebuilds scope → next request gets new UI
```

No SSH, no Docker restart, no Railway redeploy. The configuration governance
stays on the NEAR blockchain where it belongs.
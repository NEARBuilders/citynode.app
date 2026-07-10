---
name: api-and-auth
description: API architecture, oRPC contracts, auth middleware, plugin-client composition, session handling, and client-side auth. Use when adding API routes, creating middleware, calling other plugins in-process, or integrating auth in routes and UI.
metadata:
  sources: "api/src/index.ts,api/src/contract.ts,api/src/lib/auth.ts,host/src/services/auth.ts,host/src/services/plugins.ts,host/src/program.ts,ui/src/lib/auth.ts,ui/src/lib/api.ts"
---

# API Architecture & Auth

## Plugin Anatomy

The API is an every-plugin registered via `createPlugin.withPlugins<PluginsClient>()`:

```ts
export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({ /* typed config */ }),
  secrets: z.object({ /* typed env vars, defaults for dev */ }),
  context: z.object({ /* per-request context injected by host */ }),
  contract,                        // oRPC router from ./contract.ts
  initialize: (config, plugins) => Effect.promise(async () => {
    // Startup: create DB driver, run migrations, create services, publisher
    return { db, upvoteService, publisher, auth, plugins };
  }),
  shutdown: (services) => Effect.promise(async () => { /* cleanup */ }),
  createRouter: (services, builder) => ({
    ping: builder.ping.handler(async () => ({ status: "ok", timestamp })),
    // ... handler implementations
  }),
});
```

### Fields

- **`variables`**: Public config (Zod schema) — set in `bos.config.json`.
- **`secrets`**: Private config (Zod schema) — loaded from `process.env` by the host, defaults for dev.
- **`context`**: Per-request context injected by the host's session middleware (userId, user, organizationId, reqHeaders, getRawBody).
- **`contract`**: The typed oRPC router from `./contract.ts`.
- **`initialize`**: Startup logic using Effect. Returns a services object passed to `createRouter`.
- **`createRouter`**: Maps contract procedure names to handler implementations.
- **`plugins`** (second arg to `initialize`): The `PluginsClient` map for calling other plugins in-process.

## oRPC Contract Design

Defined in `api/src/contract.ts`:

```ts
import { BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const contract = oc.router({
  // Simple GET
  ping: oc.route({ method: "GET", path: "/ping" }).output(
    z.object({ status: z.literal("ok"), timestamp: z.iso.datetime() }),
  ),

  // POST with input validation
  upvoteThing: oc
    .route({ method: "POST", path: "/upvotes" })
    .input(z.object({ thingId: z.string() }))
    .output(z.object({ thingId: z.string(), userId: z.string(), totalCount: z.number().int().nonnegative() }))
    .errors({ UNAUTHORIZED, BAD_REQUEST }),

  // Path parameter
  getUserVote: oc
    .route({ method: "GET", path: "/upvotes/{thingId}/me" })
    .input(z.object({ thingId: z.string() }))
    .output(z.object({ thingId: z.string(), hasUpvote: z.boolean() }))
    .errors({ UNAUTHORIZED }),

  // Cursor pagination
  getUpvoteFeed: oc
    .route({ method: "GET", path: "/upvotes/feed" })
    .input(z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }))
    .output(z.object({ data: z.array(/*...*/), meta: z.object({ total, hasMore, nextCursor }) })),

  // SSE streaming
  subscribeUpvotes: oc
    .route({ method: "GET", path: "/upvotes/stream" })
    .output(eventIterator(VoteEventSchema)),
});
```

Key conventions:
- `.errors()` declares typed errors the procedure may throw
- Path params use `{paramName}` syntax, match Zod input keys
- `.output(eventIterator(Schema))` enables SSE streaming
- Export `type ContractType = typeof contract` for type generation

## Route Implementation

In `createRouter`, map each contract procedure to a handler:

```ts
createRouter: (services, builder) => {
  const { requireAuth } = createAuthMiddleware(builder);

  return {
    ping: builder.ping.handler(async () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })),

    upvoteThing: builder.upvoteThing.use(requireAuth).handler(async ({ input, context }) => {
      return await services.upvoteService.upvoteThing(input.thingId, context.userId);
    }),

    // SSE handler (async generator)
    subscribeUpvotes: builder.subscribeUpvotes.handler(async function* ({ signal, lastEventId }) {
      const iterator = services.publisher.subscribe("vote", { signal, lastEventId });
      for await (const event of iterator) {
        yield event;
      }
    }),
  };
};
```

Handler receives `{ input, context, signal?, lastEventId? }`:
- `input` — validated Zod input
- `context` — per-request context from host middleware
- `signal` — abort signal (SSE)
- `lastEventId` — resume ID (SSE)

## Middleware

Create auth middleware with `createAuthMiddleware(builder)` in `api/src/lib/auth.ts`.
Each middleware is typed with a `DecoratedMiddleware` alias that enables automatic
context narrowing through `.use()`. After applying a middleware, the handler receives
a narrowed context type — no non-null assertions needed.

```ts
const { requireAuth } = createAuthMiddleware(builder);

builder.myRoute.use(requireAuth).handler(async ({ input, context }) => {
  context.userId; // string — narrowed by middleware, no `!` needed
});
```

### Available Middlewares

| Middleware | Narrows |
|---|---|
| `requireAuth` | `userId: string`, `user: RequestAuthUser` |
| `requireAuthOrApiKey` | gate only — allows session or API key auth, no narrowing |
| `requireRole("admin")` | `userId`, `user` |
| `requireOrganization` | `userId`, `user`, `organization.activeOrganizationId: string` |
| `requireOrgRole("owner")` | all of above + `organization.member` non-null with `id`, `role` |
| `requireApiKey` | `apiKey: ApiKeyContext` |

Apply middleware with `.use()`:

```ts
builder.authHealth.use(requireAuth).handler(...)
builder.adminAction.use(requireRole("admin")).handler(...)
builder.createProject.use(requireOrganization).handler(...)
```

### Org Metadata Validation

Pass an optional Zod schema to `createAuthMiddleware` for runtime validation:

```ts
import { z } from "every-plugin/zod";

const orgMetaSchema = z.object({ plan: z.enum(["free", "pro"]), seats: z.number() });
const { requireOrganization } = createAuthMiddleware(builder, { orgMetaSchema });
```

When a schema is provided, `requireOrganization` and `requireOrgRole` call
`schema.safeParse()` on the org metadata. On parse failure, throws
`INTERNAL_SERVER_ERROR` (data integrity issue). When no schema is passed,
metadata stays `Record<string, unknown>` with no validation.

### Typed Org Context Helpers

```ts
import type { OrgAuthenticatedContext } from "./lib/auth";

type MyOrgMeta = { plan: "free" | "pro"; seats: number };

// After requireOrganization, cast for typed metadata access:
const ctx = context as OrgAuthenticatedContext<MyOrgMeta>;
ctx.organization.organization?.metadata?.plan; // "free" | "pro"
```

Also available: `OrgMemberAuthenticatedContext<TMeta>` (guarantees
`organization.member` is non-null). Both types derive from the generated
`AuthOrganizationContext`/`AuthOrganizationSummary`, so future auth plugin
field additions flow through automatically.

## Error Handling

Use `ORPCError` from `every-plugin/errors`:

```ts
import { ORPCError } from "every-plugin/orpc";
import { BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";

throw new ORPCError("UNAUTHORIZED", {
  message: "Authentication required",
  data: { hint: "Sign in or provide an API key" },
});
```

Declare which errors a procedure may throw in the contract using `.errors()`:

```ts
upvoteThing: oc.route({ method: "POST", path: "/upvotes" })
  .input(z.object({ thingId: z.string() }))
  .output(...)
  .errors({ UNAUTHORIZED, BAD_REQUEST })
```

Client-side errors are intercepted by `onError` in `createRpcLink` (`ui/src/lib/api.ts`), which shows a toast for network/fetch errors.

## Auth Plugin Architecture

The auth plugin is an **external plugin** loaded in **Phase 0** of the host's initialization:

1. **Phase 0** (`host/src/services/plugins.ts`): Load auth plugin, create `authClient` factory.
2. **Phase 1**: Load all non-API plugins (apps, projects, settings).
3. **Phase 2**: Load API plugin with `pluginsClient` (includes auth + all other plugin factories).

The host mounts the auth handler at `/api/auth/*`:

```ts
// host/src/services/auth.ts
export function registerAuthHandler(app, plugins) {
  const services = getAuthServices(plugins);
  if (!services) return;
  app.on(["POST", "GET"], "/api/auth/*", (c) => services.handler(c.req.raw));
}
```

## Session Middleware

Runs on every non-auth request. Resolves the session from cookies and sets context on the Hono request:

```ts
// host/src/services/auth.ts
export function createSessionMiddleware(plugins) {
  return async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();

    c.set("reqHeaders", c.req.raw.headers);
    // ... lazy getRawBody ...

    const authClient = authClientFactory({ reqHeaders });
    const [session, context] = await Promise.all([
      authClient.getSession(),
      authClient.getContext(),
    ]);

    c.set("user", session?.user ?? context.user ?? null);
    c.set("session", session?.session ?? null);
    c.set("walletAddress", context.near.primaryAccountId ?? null);
    c.set("apiKey", context.apiKey ?? null);
    c.set("organizationId", context.organization?.activeOrganizationId ?? null);

    await next();
  };
}
```

If auth plugin or session resolution fails, all values are `null` — routes with `requireAuth` will reject with `UNAUTHORIZED`.

The context is transformed for the API plugin via `buildPluginContext()`, with
the full `organization` envelope (activeOrganizationId, organization, member,
isPersonal, hasOrganization) from Better Auth:

```ts
// host/src/services/auth.ts
export function buildPluginContext(c) {
  return {
    userId: user?.id,
    user: user ?? undefined,
    organization: context.organization ?? undefined,
    apiKey: apiKey ?? undefined,
    reqHeaders: c.get("reqHeaders"),
    getRawBody: c.get("getRawBody"),
  };
}
```

## Auth in API Routes

The API plugin receives `auth` in the `plugins` map during `initialize`:

```ts
initialize: (config, plugins) => Effect.promise(async () => {
  const { auth, ...restPlugins } = plugins;
  return { auth, plugins: restPlugins, ... };
})
```

Use `getAuthClient()` for in-process auth calls:

```ts
import { getAuthClient, createAuthMiddleware } from "./lib/auth";

// In a service or handler:
const authClient = getAuthClient(services, { reqHeaders: context.reqHeaders });
const session = await authClient.getSession();
```

The `AuthCapableServices` interface requires an `auth` factory. If unavailable, `getAuthClient()` throws.

## Auth on the Client

Create the client with Better-Auth plugins:

```ts
// ui/src/lib/auth.ts
export function createAuthClient(runtimeConfig) {
  return betterAuth.createClient({
    baseURL: runtimeConfig.authBaseUrl,
    plugins: [
      siwn({ recipients: runtimeConfig.auth.variables.siwn.recipients, networkId }),
      passkey(),
      organization(),
      admin(),
      apiKey(),
      anonymous(),
      phone(),
    ],
  });
}
```

In route code:

```ts
import { useAuthClient, sessionQueryOptions } from "@/app";

function Component() {
  const authClient = useAuthClient();
  // authClient.signIn.email(...)
  // authClient.signOut()
  // authClient.organization.setActive(...)
}
```

The `sessionQueryOptions()` helper provides standard TanStack Query config:

```ts
const session = await queryClient.ensureQueryData(
  sessionQueryOptions(authClient, context.session),
);
```

### Auth Route Guard

The `_authenticated.tsx` layout redirects unauthenticated users:

```ts
export const Route = createFileRoute("/_layout/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const { queryClient, authClient } = context;
    const session = await queryClient.ensureQueryData(
      sessionQueryOptions(authClient, context.session),
    );
    if (!session?.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { auth: { isAuthenticated: true, user: session.user, session: session.session } };
  },
  component: AuthenticatedLayout,
});
```

## Plugin Client Composition

The host uses **two-phase loading** so API plugins can call other plugins in-process:

1. **Phase 0**: Auth plugin → `authClient` factory
2. **Phase 1**: All non-API plugins → `pluginsClient` map of `createClient` factories
3. **Phase 2**: API plugin with `{ auth, apps, projects, settings }` merged into a single `pluginsClient` map

```ts
// host/src/services/plugins.ts — simplified
const pluginsClient = { ...pluginClients };
if (authClient) pluginsClient.auth = authClient;
const baseApi = await loadPluginEntry(runtime, apiEntry, integrityRegistry, pluginsClient);
```

### Calling Plugins from API Routes

The API plugin receives `plugins` in the second argument to `initialize`:

```ts
initialize: (config, plugins) => Effect.promise(async () => {
  // plugins.auth — auth plugin client factory
  // plugins.apps — apps plugin client factory
  // plugins.projects — projects plugin client factory
  const authClient = plugins.auth({ reqHeaders: someHeaders });
  const session = await authClient.getSession();
  return { auth: plugins.auth, plugins, ... };
})
```

### API-Owned Thing Registry

Use this pattern when the API owns the durable registry and the plugin owns the semantic payload:

```ts
const provider = thingProviders[input.pluginId];
if (!provider) {
  throw new ORPCError("BAD_REQUEST", { message: `Unsupported pluginId: ${input.pluginId}` });
}
```

Rules:
- API owns `thingId`, `pluginId`, `createdAt`, and `updatedAt`.
- Plugin owns `type` and `payload`.
- `action` is a free-form string and can come from the provider or default to a platform verb like `created`.
- Keep one SSE stream for the concept and filter server-side before yielding.

### Effect And DB Lifecycle

Prefer `Layer` for long-lived resources (DB connections, service singletons) and `Effect` for the work itself. Compose layers with `.pipe(Layer.provide(...))` and access them via tags:

```ts
const myService = yield* Effect.provide(MyServiceTag, MyServiceLive);
```

Use `runEffect()` to bridge Effect and async handlers with clean ORPC error boundaries. The helper unwraps `ORPCError` instances thrown inside Effect and re-throws them directly, while converting unknown errors to `INTERNAL_SERVER_ERROR`:

```ts
import { runEffect } from "@/lib/context";

const result = await runEffect(services.myService.doSomething(input));
```

This avoids try/catch boilerplate in every handler and ensures Effect errors propagate as typed ORPC errors to the client.

Best practices:
- Keep service interfaces Effect-native. Bridge to async only at the handler boundary via `runEffect()`.
- Use `Context.Tag` for dependency injection between services — avoids manual wiring and makes testing easier via `Layer` substitution.
- Initialize long-lived resources (DB pools, publishers, cached data) in `initialize` and return them as services. `createRouter` receives the initialized context.

### SSR Proxy Client

For SSR, `createPluginsClient()` creates a Proxy that merges the API client with all plugin clients:

```ts
// host/src/services/plugins.ts
export function createPluginsClient(result, context) {
  const apiClient = result.api?.createClient(context);
  const pluginClients = {};
  for (const [key, plugin] of Object.entries(result.plugins)) {
    if (key === "api") continue;
    pluginClients[key] = plugin.createClient(context);
  }
  if (result.authClient) pluginClients.auth = result.authClient(context);

  return new Proxy(apiClient, {
    get(target, key) {
      if (typeof key === "string" && key in pluginClients) return pluginClients[key];
      return Reflect.get(target, key);
    },
  });
}
```

## Generated Types

| File | Contents | Regenerated by |
|------|----------|---------------|
| `api/src/lib/plugins-types.gen.ts` | `PluginsClient` — factory types for all plugins | `bos types gen` |
| `api/src/lib/auth-types.gen.ts` | Auth plugin request context types | `bos types gen` |
| `ui/src/lib/api-types.gen.ts` | `ApiContract` — all procedure types | `bos types gen` |
| `ui/src/lib/auth-types.gen.ts` | Auth client session/user types | `bos types gen` |

Type resolution:
- `local:plugins/<name>` → reads `src/contract.ts` directly from disk
- Remote URL → fetches contract types from the deployed plugin's manifest
- Missing local path with no URL → skipped with a warning
- Run `bos types gen` or restart `bos dev` after hand-editing `bos.config.json`

## SSE Notes

Prefer a single publisher channel per concept and filter on the consumer side:

```ts
const iterator = services.publisher.subscribe("thing", { signal, lastEventId });
for await (const event of iterator) {
  if (input.pluginId && event.pluginId !== input.pluginId) continue;
  yield event;
}
```

This keeps replay/resume behavior simple and lets the API stay the source of truth for event routing.

## How Routes Are Mounted

The host (`host/src/program.ts`) mounts API routes:

```ts
// RPCHandler + OpenAPIHandler created from API plugin's router
// Mounted at /api/rpc and /api/rpc/*
// Each plugin gets a namespace: /api/rpc/auth, /api/rpc/apps, /api/rpc/projects
```

The session middleware runs on `/api/*` before the RPC handlers, ensuring context is set.

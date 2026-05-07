---
name: plugin-development
description: Build every-plugin modules with oRPC contracts, Effect services, and Module Federation. Use when creating or modifying plugins under plugins/ or the _template scaffold.
metadata:
  sources: "src/plugin.ts,src/orpc.ts,src/errors.ts,src/zod.ts,src/types.ts"
---

# every-plugin Development

## Plugin Structure

Every plugin has three core files:

```
plugins/your-plugin/
├── src/
│   ├── contract.ts    # oRPC route definitions + Zod schemas
│   ├── service.ts     # Business logic (plain class, Effect error handling)
│   ├── index.ts       # createPlugin() wiring
│   └── __tests__/     # Integration & unit tests
├── package.json
├── rspack.config.js   # Build config (every-plugin provides defaults)
├── plugin.dev.ts      # Dev server config (port, variables, secrets)
└── tsconfig.json
```

## Step 1: Define the Contract

Import from `every-plugin` subpath exports — not from `@orpc/*` or `zod` directly:

```typescript
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const Errors = {
  UNAUTHORIZED: { status: 401, message: "Auth required" },
  NOT_FOUND: { status: 404, message: "Not found" },
};

export const contract = oc.router({
  getById: oc
    .route({ method: "GET", path: "/items/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ item: ItemSchema }))
    .errors(Errors),

  search: oc
    .route({ method: "GET", path: "/search" })
    .input(z.object({ query: z.string(), limit: z.number().default(10) }))
    .output(eventIterator(SearchResultSchema)),

  ping: oc
    .route({ method: "GET", path: "/ping" })
    .output(z.object({ status: z.literal("ok"), timestamp: z.string().datetime() })),
});

export type ContractType = typeof contract;
```

Key points:
- Always import `oc` from `every-plugin/orpc`, `z` from `every-plugin/zod`, `Effect` from `every-plugin/effect`
- Use `eventIterator(schema)` for streaming responses
- Define error objects with `status` + `message` and pass via `.errors()`
- Use `CommonPluginErrors` from `every-plugin/errors` for standard UNAUTHORIZED/FORBIDDEN/NOT_FOUND/BAD_REQUEST

## Step 2: Create the Service

Plain TypeScript class with Effect error handling:

```typescript
import { Effect } from "every-plugin/effect";

export class MyService {
  constructor(private baseUrl: string, private apiKey: string) {}

  getById(id: string) {
    return Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${this.baseUrl}/items/${id}`);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      },
      catch: (error: unknown) => new Error(`Failed to fetch item: ${error}`),
    });
  }

  ping() {
    return Effect.succeed({ status: "ok" as const, timestamp: new Date().toISOString() });
  }
}
```

## Step 3: Wire with createPlugin

```typescript
import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { MyService } from "./service";

export default createPlugin({
  variables: z.object({
    baseUrl: z.url().default("https://api.example.com"),
  }),
  secrets: z.object({
    apiKey: z.string().min(1),
  }),
  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const service = new MyService(config.variables.baseUrl, config.secrets.apiKey);
      yield* service.ping();
      return { service };
    }),

  shutdown: () => Effect.void,

  createRouter: (context, builder) => {
    const { service } = context;

    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.userId) throw new ORPCError("UNAUTHORIZED", { message: "Auth required" });
      return next({ context: { ...context, userId: context.userId } });
    });

    return {
      getById: builder.getById.use(requireAuth).handler(async ({ input, context }) => {
        return await Effect.runPromise(service.getById(input.id));
      }),
      ping: builder.ping.handler(async () => {
        return await Effect.runPromise(service.ping());
      }),
    };
  },
});
```

## Plugin Composition (withPlugins)

When an API plugin needs to call other plugins in-process:

```typescript
import type { PluginsClient } from "./plugins-client.gen";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({ demoMessage: z.string().optional() }),
  contract,
  initialize: (config, plugins) =>
    Effect.sync(() => ({ plugins, demoMessage: config.variables.demoMessage ?? "not configured" })),
  createRouter: (services, builder) => ({
    pluginDemo: builder.pluginDemo.handler(async () => {
      const status = await services.plugins.registry().getRegistryStatus();
      return { apiVariable: services.demoMessage, registryStatus: status };
    }),
  }),
});
```

- `pluginsClient` is a map of `createClient` factories, typed by the generated `PluginsClient`
- Call `services.plugins.{key}()` to execute plugin routers in-process — no HTTP roundtrip
- The host loads non-API plugins first (Phase 1), then loads the API with `pluginsClient` injected (Phase 2)

## Dev Server Config (plugin.dev.ts)

```typescript
import type { PluginConfigInput } from "every-plugin";
import Plugin from "./src/index";

export default {
  pluginId: "my-plugin",
  port: 3010,
  config: {
    variables: {
      baseUrl: "https://api.example.com",
    },
    secrets: {
      apiKey: "dev-only-key",
    },
  } satisfies PluginConfigInput<typeof Plugin>,
};
```

Port assignments: host=3000, api=3001, auth=3002, ui=3003, ui-ssr=3004, plugins=3010+.

## Build Config (rspack.config.js)

every-plugin provides rspack defaults via `EveryPluginDevServer`:

```javascript
const { EveryPluginDevServer } = require("every-plugin/build/rspack");

module.exports = EveryPluginDevServer.configure(__dirname, {
  pluginId: "my-plugin",
  port: 3010,
});
```

No manual rspack configuration needed — the helper handles Module Federation, shared deps, and dev server setup.

## Common Mistakes

- Importing `oc` from `@orpc/contract` instead of `every-plugin/orpc` — will cause version mismatches in Module Federation
- Importing `z` from `zod` instead of `every-plugin/zod` — same singleton issue
- Forgetting `.errors(Errors)` on routes that can throw ORPCError — untyped errors
- Using `Effect.runPromise` inside `Effect.gen` — use `yield*` instead for proper error channel
- Putting business logic in `createRouter` — keep it in the service class, router is just glue

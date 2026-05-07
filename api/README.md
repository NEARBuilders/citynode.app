# api

[every-plugin](https://github.com/near-everything/every-plugin) based API with oRPC and Effect-TS.

## Plugin Architecture

Built with **every-plugin** framework (Rspack + Module Federation):

```
┌─────────────────────────────────────────────────────────┐
│                    createPlugin()                       │
├─────────────────────────────────────────────────────────┤
│  variables: { ... }                                     │
│  secrets: { ... }                                       │
│  contract: oRPC route definitions                       │
│  initialize(): Effect → services                        │
│  createRouter(): handlers using services                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Host Integration                      │
├─────────────────────────────────────────────────────────┤
│  bos.config.json → plugin URL + secrets                 │
│  Two-phase loading:                                     │
│    Phase 1: Load registry, projects, etc.               │
│    Phase 2: Load API with pluginsClient injected        │
└─────────────────────────────────────────────────────────┘
```

**Plugin Structure:**

- `contract.ts` - oRPC contract definition (routes, schemas)
- `index.ts` - Plugin initialization + router handlers
- `plugins-client.gen.ts` - Generated PluginsClient type (auto-generated, gitignored)
- `services/` - Business logic with Effect-TS
- `db/` - Database schema and migrations

## Plugin Client (pluginsClient)

The API receives typed client factories for all other plugins via `createPlugin.withPlugins<PluginsClient>()`:

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
      return { apiVariable: services.demoMessage, registryStatus: status, availablePlugins: Object.keys(services.plugins) };
    }),
  }),
});
```

**How it works:**
- The host loads all non-API plugins first (Phase 1)
- Creates a `pluginsClient` map of their `createClient` factories
- Loads the API plugin with that map injected as the second `initialize` parameter (Phase 2)
- The API calls `services.plugins.{key}()` to execute plugin routers in-process — no HTTP roundtrip

**Demo endpoint**: `GET /api/demo/plugins` demonstrates the full data flow — API variable from `bos.config.json`, registry plugin call via `pluginsClient`, and available plugin listing. No auth required.

## Development

```bash
bos dev --host remote   # Remote host, local UI + API (typical)
bos dev --ui remote     # Isolate API work
```

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "api": {
      "name": "api",
      "development": "http://localhost:3001",
      "production": "https://example-api.zephyrcloud.app",
      "proxy": "https://example-api.zephyrcloud.app",
      "variables": {},
      "secrets": [
        "API_DATABASE_URL",
        "API_DATABASE_AUTH_TOKEN"
      ],
      "template": "near-everything/every-plugin/demo/api",
      "files": [
        "rspack.config.cjs",
        "tsconfig.json",
        "vitest.config.ts",
        "drizzle.config.ts",
        "plugin.dev.ts"
      ],
      "sync": {
        "scripts": ["dev", "build", "test"]
      }
    }
  }
}
```

## Tech Stack

- **Framework**: every-plugin + oRPC
- **Effects**: Effect-TS for service composition
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rspack + Module Federation

## Scripts

- `bun dev` - Start dev server (port 3001)
- `bun build` - Build plugin
- `bun test` - Run tests
- `bun db:push` - Push schema to database
- `bun db:studio` - Open Drizzle Studio

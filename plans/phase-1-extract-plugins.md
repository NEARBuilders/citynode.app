# Phase 1: Extract Business Logic into Plugins — COMPLETED ✅

> Goal: Make this repo the template source. Business logic moves from `api/` into `plugins/registry/` and `plugins/projects/`. The `api/` becomes a thin structural shell. Auth stays as-is in `ui/` and `host/`.

## Principles

- Every plugin is self-contained with its own middleware, DB, and services
- `requireAuth`, `requireNearAccount`, `requireOrgRole` are duplicated across plugins — that's correct
- Auth client, session helpers, and all auth routes in `ui/` are essential framework code, not business logic
- `host/` is NOT in `.templatekeep` — remote by default, optional via `bos init --with-host`
- `.templatekeep` is inclusion-based — only listed files appear in template output
- Each plugin has its own rspack config, package.json, and can be independently deployed

## Architecture After Extraction

```
plugins/
├── _template/              ← existing scaffold (unchanged)
├── registry/               ← NEW: FastKV app discovery, metadata publish/relay
│   ├── src/
│   │   ├── contract.ts     ← registry oRPC routes
│   │   ├── index.ts         ← createPlugin + services + middleware
│   │   └── services/
│   │       ├── registry.ts  ← FastKV reads, config resolution, app listing
│   │       └── fastkv.ts    ← FastKV API client
│   └── ...
└── projects/               ← NEW: Projects CRUD, KV store, org management
    ├── src/
    │   ├── contract.ts      ← project + KV + org + API key routes
    │   ├── index.ts         ← createPlugin + DB + services + middleware
    │   ├── services/
    │   │   ├── projects.ts  ← project CRUD, visibility, app linking
    │   │   └── kv.ts        ← key-value store CRUD
    │   └── db/
    │       ├── schema.ts    ← kvStore, projects, projectApps tables
    │       ├── index.ts      ← createDatabase, getDatabase, Database type
    │       ├── layer.ts       ← DatabaseTag + DatabaseLive Effect Layer
    │       └── migrations/
    │           └── 0001_initial.sql
    └── ...
```

## Steps

### 1. Scaffold `plugins/registry/`

- [ ] Copy `plugins/_template/` as base structure
- [ ] Modify `package.json`: name → `@everything-dev/registry-plugin`, add dependencies (`@libsql/client`, `drizzle-orm` as peerDeps, `better-auth` as peerDep), keep `every-plugin` as devDep
- [ ] Modify `rspack.config.js`: NO `DrizzleORMMigrations` (no DB), keep `EmitPluginManifest`, `EveryPluginDevServer`, `FixMfDataUriPlugin`
- [ ] Modify `plugin.dev.ts`: add `REGISTRY_RELAY_*` env vars, set port
- [ ] Update `tsconfig.json` and `tsconfig.contract.json`
- [ ] Add empty `src/contract.ts`, `src/index.ts`, `src/services/` directory
- [ ] Verify plugin builds with `bun run build`

### 2. Create `plugins/registry/src/services/fastkv.ts`

- [ ] Adapt from `api/src/services/fastkv.ts`
- [ ] Keep `RegistryConfigService` Effect Tag + Live Layer
- [ ] Keep `fetchBosConfigFromFastKv`, URL builders, key parsers
- [ ] Keep `listLatestValues`, `readLatestValue` FastKV REST API calls
- [ ] Remove `setApiDatabaseConfig` pattern (not needed — no DB in registry plugin)

### 3. Create `plugins/registry/src/services/registry.ts`

- [ ] Adapt from `api/src/services/registry.ts`
- [ ] Keep `RegistryService` Tag + `createRegistryMethods` factory
- [ ] Keep all listing/getting functions: `listRegistryApps`, `getRegistryApp`, `getRegistryAppByHost`, `getRegistryAppsByAccount`, `getRegistryStatus`
- [ ] Keep metadata functions: `prepareRegistryMetadataWrite`, `relayRegistryMetadataWrite`
- [ ] Keep `getRegistryRelaySender`
- [ ] Adapt to use plugin's own `RegistryConfigService` instead of api-level dependency injection

### 4. Create `plugins/registry/src/contract.ts`

- [ ] Define registry Zod schemas: `registryAppSummarySchema`, `registryAppDetailSchema`, `registryMetadataSchema`, `registryMetaSchema`, `preparedRegistryMetadataWriteSchema`, `registryRelayResultSchema`
- [ ] Define routes:
  - `listRegistryApps` — GET `/v1/registry/apps`
  - `getRegistryApp` — GET `/v1/registry/apps/{accountId}/{gatewayId}`
  - `getRegistryAppsByAccount` — GET `/v1/registry/apps/account/{accountId}`
  - `getRegistryAppByHost` — GET `/v1/registry/apps/by-host`
  - `getRegistryStatus` — GET `/v1/registry/status`
  - `prepareRegistryMetadataWrite` — POST `/v1/registry/apps/{accountId}/{gatewayId}/metadata/prepare`
  - `relayRegistryMetadataWrite` — POST `/v1/registry/metadata/relay`
- [ ] Define `requireNearAccount` middleware (copy from api)

### 5. Create `plugins/registry/src/index.ts`

- [ ] `createPlugin` with:
  - `variables`: `registryNamespace: z.string().optional()`
  - `secrets`: `REGISTRY_RELAY_ACCOUNT_ID`, `REGISTRY_RELAY_PRIVATE_KEY`, `REGISTRY_RELAY_NETWORK` (all optional)
  - `context`: `nearAccountId: z.string().optional()`
  - `contract`: from `./contract`
  - `initialize`: create `RegistryConfigService` and `RegistryService`
  - `shutdown`: Effect.void
  - `createRouter`: wire all handlers, apply `requireNearAccount` middleware where needed

### 6. Scaffold `plugins/projects/`

- [ ] Copy `plugins/_template/` as base structure
- [ ] Modify `package.json`: name → `@everything-dev/projects-plugin`, add `@libsql/client`, `drizzle-orm` as deps, `better-auth` as peerDep
- [ ] Modify `rspack.config.js`: ADD `DrizzleORMMigrations()` plugin from `@proj-airi/unplugin-drizzle-orm-migrations/rspack` (same pattern as host)
- [ ] Add `drizzle.config.ts`
- [ ] Modify `plugin.dev.ts`: add `PROJECTS_DATABASE_URL`, `PROJECTS_DATABASE_AUTH_TOKEN` secrets
- [ ] Update `tsconfig.json` and `tsconfig.contract.json`
- [ ] Create `src/db/`, `src/services/`, `src/contract.ts`, `src/index.ts`

### 7. Create `plugins/projects/src/db/`

- [ ] `schema.ts` — Move `kvStore`, `projects`, `projectApps` tables from `api/src/db/schema.ts`
- [ ] `index.ts` — Adapt from `api/src/db/index.ts`: `createDatabase`, `getDatabase`, `Database` type, `setProjectsDatabaseConfig`
- [ ] `layer.ts` — Adapt from `api/src/db/layer.ts`: `DatabaseTag` + `DatabaseLive` Effect Layer, parameterized by DB URL
- [ ] `migrations/0001_initial.sql` — Create `key_value_store`, `projects`, `project_apps` tables (from `api/src/db/migrations/`)

### 8. Create `plugins/projects/src/services/`

- [ ] `projects.ts` — Adapt from `api/src/services/projects.ts`:
  - Keep `ProjectService` Tag + `ProjectServiceLive` Layer
  - Keep all CRUD: `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`
  - Keep app linking: `listProjectApps`, `linkAppToProject`, `unlinkAppFromProject`, `listProjectsForApp`
  - Keep visibility access: `canViewProject`, `canEditProject`
  - Change DB dependency from api's `DatabaseTag` to projects plugin's `DatabaseTag`
- [ ] `kv.ts` — Adapt from `api/src/services/kv.ts`:
  - Keep `KvService` Tag + `KvServiceLive` Layer
  - Keep `listKeys`, `getValue`, `setValue`, `deleteKey`
  - Owned by `nearAccountId` with ownership checks
  - Change DB dependency to projects plugin's `DatabaseTag`

### 9. Create `plugins/projects/src/contract.ts`

- [ ] Define Zod schemas for all inputs/outputs
- [ ] Project routes:
  - `listProjects` — GET `/v1/projects`
  - `getProject` — GET `/v1/projects/{id}`
  - `createProject` — POST `/v1/projects`
  - `updateProject` — PATCH `/v1/projects/{id}`
  - `deleteProject` — DELETE `/v1/projects/{id}`
  - `listProjectApps` — GET `/v1/projects/{projectId}/apps`
  - `linkAppToProject` — POST `/v1/projects/{projectId}/apps`
  - `unlinkAppFromProject` — DELETE `/v1/projects/{projectId}/apps/{accountId}/{gatewayId}`
  - `listProjectsForApp` — GET `/v1/apps/{accountId}/{gatewayId}/projects`
- [ ] KV routes: `listKeys`, `getValue`, `setValue`, `deleteKey`
- [ ] Organization routes: `listOrgMembers`, `listOrgInvitations`, `cancelInvitation`, `resendInvitation`
- [ ] API key routes: `listApiKeys`, `createApiKey`, `deleteApiKey`
- [ ] Define `requireAuth` middleware (copy from api)
- [ ] Define `requireNearAccount` middleware (copy from api)
- [ ] Define `requireOrgRole` middleware (copy from api)

### 10. Create `plugins/projects/src/index.ts`

- [ ] `createPlugin` with:
  - `secrets`: `PROJECTS_DATABASE_URL: z.string().default("file:./projects.db")`, `PROJECTS_DATABASE_AUTH_TOKEN: z.string().optional()`
  - `context`: full auth context (`userId`, `user`, `nearAccountId`, `nearAccounts`, `organizationId`, `organizationRole`, `reqHeaders`, `auth`)
  - `contract`: from `./contract`
  - `initialize`: create `DatabaseLive` → `KvServiceLive` → `ProjectServiceLive`
  - `shutdown`: close DB connection
  - `createRouter`: wire all handlers with appropriate middleware (`requireAuth`, `requireNearAccount`, `requireOrgRole`)

### 11. Thin `api/src/contract.ts`

- [ ] Remove all business Zod schemas (registry, KV, project, org, API key)
- [ ] Remove all business routes (listRegistryApps, getRegistryApp, etc.)
- [ ] Keep: `ping`, `authHealth` schemas and route definitions
- [ ] Keep: `publicError`, `protectedError` schemas and route definitions
- [ ] Keep: `CommonPluginErrors` and error schema definitions (used by health/error routes)
- [ ] Verify remaining contract compiles

### 12. Thin `api/src/index.ts`

- [ ] Remove: `DatabaseLive` wiring for business services (`KvServiceLive`, `ProjectServiceLive`, `RegistryConfigService`)
- [ ] Remove: all business service imports (`KvService`, `ProjectService`, `RegistryConfigService`, `RegistryConfig`)
- [ ] Remove: all business handler implementations (registry, KV, project, org, API key handlers)
- [ ] Remove: all standalone function imports from services/registry.ts
- [ ] Remove: `registryNamespace` variable
- [ ] Remove: `REGISTRY_RELAY_*` secrets
- [ ] Keep: `requireAuth` middleware (duplicated in plugins, but api needs it too)
- [ ] Keep: `requireNearAccount` middleware
- [ ] Keep: `requireOrgRole` middleware
- [ ] Keep: `AuthContext` interface (full version with nearAccountId, nearAccounts, organizationId, organizationRole)
- [ ] Keep: full `context` schema
- [ ] Keep: `ping`, `authHealth`, `publicError`, `protectedError` handlers
- [ ] Keep: `DatabaseLive` for future api-specific tables
- [ ] Add import of `healthService` or inline the ping/authHealth handlers
- [ ] Verify plugin still loads and health routes respond

### 13. Add `api/src/services/health.ts`

- [ ] Create file with `ping` handler: `{ status: "ok", timestamp: new Date().toISOString() }`
- [ ] Create `authHealth` handler: checks auth configuration status
- [ ] Export both handlers for use in `index.ts`

### 14. Empty `api/src/db/schema.ts`

- [ ] Remove `kvStore`, `projects`, `projectApps` table definitions
- [ ] Keep file with empty export or comment: `// Business tables moved to plugins/projects/src/db/schema.ts`
- [ ] Verify api still builds

### 15. Clean up `api/src/db/migrations/`

- [ ] Remove business migration files (the ones creating kvStore, projects, projectApps tables)
- [ ] Keep `api/src/db/migrator.ts` if it's generic; remove if it was only for business tables
- [ ] Or remove the entire `migrations/` directory if no longer needed by the thin api

### 16. Remove business service files from `api/`

- [ ] Delete `api/src/services/registry.ts`
- [ ] Delete `api/src/services/fastkv.ts`
- [ ] Delete `api/src/services/kv.ts`
- [ ] Delete `api/src/services/projects.ts`
- [ ] Verify api still builds

### 17. Update `bos.config.json`

- [ ] Add `registry` plugin entry: `{ "development": "local:plugins/registry", "production": "" }`
- [ ] Add `projects` plugin entry: `{ "development": "local:plugins/projects", "production": "" }`
- [ ] Verify `bos dev` discovers both new plugins

### 18. Test `bos dev` end-to-end

- [ ] Run `bun install` to link new workspace packages
- [ ] Run `bos dev --host remote` and verify:
  - [ ] Registry plugin loads correctly
  - [ ] Projects plugin loads correctly (DB migrations run)
  - [ ] API plugin loads correctly with only health routes
  - [ ] All three plugins appear in `bos plugin list`
  - [ ] Registry plugin routes respond (list apps, get app, etc.)
  - [ ] Projects plugin routes respond (CRUD, KV, org management)
  - [ ] Health routes still work (`/ping`, `/api/rpc/ping`)
  - [ ] Existing host UI still functions

### 19. Create `.templatekeep`

- [ ] Create `/plans/.templatekeep` (or root level) with inclusion list:

```
# Root
bos.config.json
package.json
.env.example
biome.json
bunfig.toml

# Deployment
Dockerfile
railway.json

# Agent/docs
.agent/
AGENTS.md

# UI — structural + auth (all auth included)
ui/package.json
ui/rsbuild.config.ts
ui/tsconfig.json
ui/public/**
ui/src/hydrate.tsx
ui/src/router.tsx
ui/src/router.server.tsx
ui/src/styles.css
ui/src/globals.d.ts
ui/src/app.ts
ui/src/api-contract.ts
ui/src/components/index.ts
ui/src/components/ui/**
ui/src/components/error-boundary.tsx
ui/src/components/loading.tsx
ui/src/components/theme-toggle.tsx
ui/src/providers/index.tsx
ui/src/hooks/index.ts
ui/src/hooks/use-client.ts
ui/src/types/index.ts
ui/src/lib/api-client.ts
ui/src/lib/auth-client.ts
ui/src/lib/session.ts
ui/src/lib/utils.ts
ui/src/lib/use-api-client.ts
ui/src/routes/__root.tsx
ui/src/routes/_layout.tsx
ui/src/routes/_layout/_authenticated.tsx
ui/src/routes/_layout/_admin.tsx
ui/src/routes/_layout/_admin/dashboard.tsx
ui/src/routes/_layout/login.tsx
ui/src/routes/_layout/index.tsx

# API — structural shell
api/package.json
api/rspack.config.js
api/plugin.dev.ts
api/tsconfig.json
api/tsconfig.contract.json
api/src/contract.ts
api/src/index.ts
api/src/services/health.ts
api/src/db/index.ts
api/src/db/layer.ts
api/src/db/schema.ts

# Plugin template
plugins/_template/**

# Plugins — structural (included in template)
plugins/registry/**
plugins/projects/**
```

### 20. Simplify `ui/src/routes/_layout/index.tsx`

- [ ] Replace current business landing page with a simple authenticated welcome page
- [ ] Keep a redirect to authenticated home or a simple "Welcome" message
- [ ] The current landing page (`apps/`, branding, etc.) stays in this repo but is excluded from `.templatekeep`

### 21. Verify typecheck and lint pass

- [ ] Run `bun run typecheck` across the monorepo
- [ ] Run `bun run lint` and fix any issues
- [ ] Verify `plugins/registry/` typechecks
- [ ] Verify `plugins/projects/` typechecks
- [ ] Verify thinned `api/` typechecks

### 22. Update `CONTRIBUTING.md` and `AGENTS.md`

- [ ] Add section about plugin architecture in `AGENTS.md`
- [ ] Document that business logic belongs in `plugins/`, not `api/`
- [ ] Note that `api/` is for health, auth middleware, and structural routes only
- [ ] Update `CONTRIBUTING.md` with plugin development workflow

## Notes

### Virtual Module DB Migrations

Both `host/` and `plugins/projects/` use `DrizzleORMMigrations` from `@proj-airi/unplugin-drizzle-orm-migrations/rspack`. This plugin:
- Bundles migration SQL files into a virtual module at build time
- The host uses it for auth tables, projects plugin uses it for business tables
- Each plugin manages its own migrations independently

### Migration Path for Existing Deployments

- `api.db` currently has `kvStore`, `projects`, `projectApps` tables
- `projects.db` will be a new separate database created by the projects plugin
- Old tables in `api.db` become orphaned but harmless
- Consider adding a cleanup script or documentation for dropping orphaned tables

### Future Work (Not in Phase 1)

- **`bos init` command**: Uses degit to clone this repo, applies `.templatekeep` filter, personalizes `bos.config.json`
- **`bos update` command**: Diffs user's project against latest template
- **Business UI routes**: Currently stay in `ui/` and are excluded by `.templatekeep`. Future: could be loaded from a UI plugin via Module Federation
- **Separate template repo**: Consider creating `nearbuilders/everything-template` as a pre-thinned snapshot for faster `bos init`
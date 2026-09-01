<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/devtools#devtools-app-setup"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools#devtools-app-setup"
    for: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
  - id: "@tanstack/devtools#devtools-marketplace"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools#devtools-marketplace"
    for: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
  - id: "@tanstack/devtools#devtools-plugin-panel"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools#devtools-plugin-panel"
    for: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
  - id: "@tanstack/devtools#devtools-production"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools#devtools-production"
    for: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
  - id: "@tanstack/devtools-event-client#devtools-bidirectional"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-bidirectional"
    for: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
  - id: "@tanstack/devtools-event-client#devtools-event-client"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-event-client"
    for: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
  - id: "@tanstack/devtools-event-client#devtools-instrumentation"
    run: "bunx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-instrumentation"
    for: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
  - id: "better-near-auth#client"
    run: "bunx @tanstack/intent@latest load better-near-auth#client"
    for: "Set up the siwnClient plugin for Better Auth client, configure NEAR wallet connection via NearConnect, use authClient.near actions for sign-in, profile lookup, account management, delegate action building with TransactionBuilder, and relay submission. Load when implementing NEAR wallet sign-in on the client, using authClient.near.* methods, or building delegate actions for gasless relay."
  - id: "better-near-auth#relay"
    run: "bunx @tanstack/intent@latest load better-near-auth#relay"
    for: "Configure the gasless NEP-366 delegate action relayer in ephemeral or explicit mode, relay signed delegate actions on-chain, enforce contract whitelisting and gas/deposit limits, check relay status and history, and use the contract view endpoint. Load when setting up relayer config, debugging relay failures, or configuring RotatingKeyStore for high-throughput relay."
  - id: "better-near-auth#siwn"
    run: "bunx @tanstack/intent@latest load better-near-auth#siwn"
    for: "Set up the SIWN server plugin for Better Auth, configure NEP-413 authentication with recipient and API key, handle nonce generation, signature verification, account linking and unlinking, and NEAR profile lookup. Load when adding NEAR wallet sign-in to a Better Auth server, configuring siwn() plugin options, or debugging NEP-413 verify or nonce issues."
  - id: "better-near-auth#tanstack"
    run: "bunx @tanstack/intent@latest load better-near-auth#tanstack"
    for: "Integrate better-near-auth with TanStack Router (SSR or CSR). Set up auth client as a router context singleton, useAuthClient hook, session query options, inferred types from AuthClient, and ensureConnected before signing. Load when scaffolding a new TanStack Router app with better-near-auth, wiring auth into router context, or debugging wallet state loss after sign-in in SSR/CSR TanStack apps."
  - id: "dotenv#dotenv"
    run: "bunx @tanstack/intent@latest load dotenv#dotenv"
    for: "Load environment variables from a .env file into process.env for Node.js applications. Use when configuring apps with secrets, setting up local development environments, managing API keys and database uRLs, parsing .env file contents, or populating environment variables programmatically. Always use this skill when the user mentions .env, even for simple tasks like \"set up dotenv\" — the skill contains critical gotchas (encrypted keys, variable expansion, command substitution) that prevent common production issues."
  - id: "dotenv#dotenvx"
    run: "bunx @tanstack/intent@latest load dotenv#dotenvx"
    for: "Use dotenvx to run commands with environment variables, manage multiple .env files, expand variables, and encrypt env files for safe commits and CI/CD."
  - id: "every-plugin#plugin-client"
    run: "bunx @tanstack/intent@latest load every-plugin#plugin-client"
    for: "Connect to and consume deployed everything.dev plugins from an external app, child project, or script. Use when creating API/auth clients, reading runtime config, authenticating with API keys or sessions, or calling plugin routes programmatically."
  - id: "every-plugin#plugin-development"
    run: "bunx @tanstack/intent@latest load every-plugin#plugin-development"
    for: "Build every-plugin modules with oRPC contracts, Effect services, and Module Federation. Use when creating or modifying plugins under plugins/ or the _template scaffold."
  - id: "every-plugin#plugin-testing"
    run: "bunx @tanstack/intent@latest load every-plugin#plugin-testing"
    for: "Test every-plugin modules with vitest and the plugin runtime. Use when writing or modifying plugin tests under plugins/*/src/__tests__/ or plugins/*/tests/."
  - id: "everything-dev#api-and-auth"
    run: "bunx @tanstack/intent@latest load everything-dev#api-and-auth"
    for: "API architecture, oRPC contracts, auth middleware, plugin-client composition, session handling, and client-side auth. Use when adding API routes, creating middleware, calling other plugins in-process, or integrating auth in routes and UI."
  - id: "everything-dev#cli-reference"
    run: "bunx @tanstack/intent@latest load everything-dev#cli-reference"
    for: "Quick reference for all bos CLI commands — flags, options, environment settings, and links to detailed guidance in related skills. Use when any bos command comes up or the user needs a CLI overview."
  - id: "everything-dev#code-style"
    run: "bunx @tanstack/intent@latest load everything-dev#code-style"
    for: "Code style conventions for everything-dev projects — component file naming (kebab-case, lowercase), CSS (semantic Tailwind only, no hardcoded colors), no comments in implementation, import/export conventions, and following neighboring file patterns."
  - id: "everything-dev#dev-workflow"
    run: "bunx @tanstack/intent@latest load everything-dev#dev-workflow"
    for: "Development workflow for everything-dev projects using bos dev, bos start, and the Module Federation runtime. Use when starting dev servers, debugging hot reload, or understanding the service-descriptor architecture."
  - id: "everything-dev#extends-config"
    run: "bunx @tanstack/intent@latest load everything-dev#extends-config"
    for: "How bos.config.json extends chains work, deep merge semantics, resolved config lifecycle, env-specific extends, and canonical field ordering. Use when debugging extends inheritance, configuring per-environment parents, understanding what dev writes vs publish writes, or reasoning about config merging."
  - id: "everything-dev#init-upgrade"
    run: "bunx @tanstack/intent@latest load everything-dev#init-upgrade"
    for: "bos init, bos sync, and bos upgrade workflows — template download, snapshot-based conflict detection, package version bumps, and how init/sync select and own files. Use when scaffolding new projects, syncing upstream changes, or upgrading framework packages."
  - id: "everything-dev#plugin-development"
    run: "bunx @tanstack/intent@latest load everything-dev#plugin-development"
    for: "Build, register, and deploy plugins within everything.dev. Covers the _template scaffold, contract/service/index pattern, database setup with Drizzle, bos.config.json registration, plugin UI, and CLI workflow. Use when creating new plugins, adding database-backed routes, or deploying plugins to production."
  - id: "everything-dev#publish-sync"
    run: "bunx @tanstack/intent@latest load everything-dev#publish-sync"
    for: "Publish bos.config.json to the FastKV registry, sync from upstream, and upgrade workspace packages. Use when deploying, syncing, or managing runtime configuration across projects."
  - id: "everything-dev#super-app"
    run: "bunx @tanstack/intent@latest load everything-dev#super-app"
    for: "Build shared-host, shared-API super apps with tenant-specific UI composition. Use when setting up a base runtime plus custom tenant apps, configuring fixed-core multi-tenancy, reasoning about extends-based runtime lineage, or deciding what tenants can override today."
  - id: "everything-dev#ui-integration"
    run: "bunx @tanstack/intent@latest load everything-dev#ui-integration"
    for: "Route creation, API client usage, auth client, SSR hydration, and the @/app module surface. Use when adding new UI routes, fetching data from the API, implementing auth flows, or customizing navigation."
<!-- intent-skills:end -->

# Agent Instructions

This document provides operational guidance for AI agents working in the parent `everything.dev` repository.

## Quick Reference

**Start Development:**
```bash
cp .env.example .env   # First time only
bun install
docker compose up -d --wait   # Start local Postgres (api_db:5432, auth_db:5433)
bun run dev

# Or combined: bun run dev:postgres  ==  docker compose up -d --wait && bun run dev

# Pin individual service ports (unset flags are auto-picked and persisted in .bos/infra-state.json)
bos dev --port 3100 --api-port 3101 --ui-port 3103 --auth-port 3102 --plugin-port-start 3110
```

`docker-compose.yml` is committed and provisions two Postgres 17 services:
- `postgres-api` (port 5432, db `api_db`) — shared by the API and all local plugins; each plugin isolates its tables in a `plugin_<pluginId>` schema (set via `search_path` on every connection, see `api/src/db/layer.ts`).
- `postgres-auth` (port 5433, db `auth_db`) — auth database.

The API and plugins auto-apply migrations on boot, so `bun db:migrate` is optional (use it to migrate without starting the dev server). `bun run dev` runs `bos dev`'s preflight, which probes the localhost DB ports and exits with a clear `docker compose up -d --wait` hint if Postgres isn't up.

Dev ports are persisted to `.bos/infra-state.json` under `devPorts` and reused across restarts.
`CORS_ORIGIN` in `.env.example` is derived from the actual resolved host port in development.
A global PID registry at `~/.cache/everything-dev/pids.json` tracks running `bos dev` sessions.

**Sync and Publish:**
```bash
bos sync              # Pull updates from published config/template state
bos upgrade           # Check for new versions, update, then sync
bos publish           # Publish config to the FastKV registry
bos publish --deploy  # Build/deploy all workspaces, then publish
```

**Check Status:**
```bash
bos ps        # List tracked development processes (PID, role, ports, age)
bos kill      # SIGTERM processes owned by the cwd
bos kill --all              # SIGTERM across all config directories
bos kill --signal SIGKILL    # Force kill
bos status    # Project health check
bos info      # Show configuration
```

## Architecture

This is the parent **Module Federation monorepo** for `everything.dev`. The host is in this repository under `host/`. You may work across `/host`, `/ui`, `/api`, `/plugins`, and `/packages`.

```
┌─────────────────────────────────────────────────────────┐
│                    Host (Server)                        │
│  - Hono.js + oRPC router                               │
│  - Runtime config loader (bos.config.json)              │
│  - Module Federation host                               │
│  - every-plugin runtime                                │
└─────────────────────────────────────────────────────────┘
            ↓                ↓                ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│       UI         │ │  Auth Plugin     │ │  API + Plugins   │
│  - React 19      │ │  - every-plugin  │ │  - every-plugin  │
│  - TanStack      │ │  - Better-Auth   │ │  - oRPC contract │
│  - Module Fed.   │ │  - NEAR SIWN     │ │  - Effect svc    │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

The host loads UI and API at runtime from URLs in `bos.config.json`. In production today, the host still boots one base `RuntimeConfig` snapshot at startup, but it can resolve tenant-specific UI overrides per request while keeping the server core fixed.

### Runtime Config

All runtime configuration lives in `bos.config.json`. The UI reads `window.__RUNTIME_CONFIG__` to get account, gateway, API base URL, etc. The host uses the same config to wire Module Federation remotes, auth, plugins, and SSR.

Use these helpers from `@/app`:
- `getAppName()` — active runtime title (falls back to account)
- `getAccount()` — NEAR account from config
- `getRepository()` — repository URL from config
- `getActiveRuntime()` — active runtime info (accountId, gatewayId, title)
- `getRuntimeConfig()` — full client config

Important: fixed-core tenant runtime composition now lives primarily in:
- `host/src/services/tenant-runtime.ts`
- `host/src/program.ts`
- `host/src/services/federation.server.ts`

Tenant model:
- `extends` is the lineage edge between runtimes
- `account` is the tenant namespace root for the active runtime
- `domain` is the public ingress for that runtime
- a runtime can extend another runtime and still become a new tenant root on its own domain

Current fixed-core host rules:
- the shared host still boots once from one base runtime snapshot
- child runtime config must extend the active BOS runtime
- supported request-scoped overrides are `ui` and existing `plugins.<id>.ui`
- tenant SSR is gated per-tenant by the `allowSsr` column on the tenant record; the host's BindingResolver reads permissions from the API's `GET /tenants/bindings` endpoint (cached for 30s)
- nested label routing and account-relative tenant derivation are the intended architecture direction, but not the complete resolver behavior today

For full per-request host/plugin/auth/api swapping, see `plans/` for design docs.

## Development Workflow

### Typical Session
1. `bun run dev` to start development
2. UI available at http://localhost:3003, API at http://localhost:3001, Auth at http://localhost:3002
3. Check `.bos/logs/` for process logs if issues occur
4. Use `bos kill` to clean up processes when done

### Debugging Issues

**API not responding:**
- Check `bos ps` to see if API process is running
- Check `.bos/logs/api.log` for errors

**UI not loading:**
- Verify host is running: `bos ps`
- Check browser console for Module Federation errors
- Clear browser cache and retry

**Type errors:**
- Run `bun typecheck`
- Ensure `api/src/contract.ts` is in sync with UI usage

### Self-Deployed Development

You don't need to wait for a PR to merge and run through CI/CD to see your changes in production. The architecture supports independent self-deployment: publish your own config on-chain under your own NEAR account and run your own host instance, all while inheriting the base platform via `extends`.

**Local dev (no NEAR account needed):**

```bash
bun run dev    # hot reload, all services local
```

**Self-deployed production (step-by-step):**

1. **Install near-cli-rs** (needed for account management and `bos key generate`; `bos publish` signs transactions in-process via near-kit):
   ```bash
   curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/download/v0.23.5/near-cli-rs-installer.sh | sh
   near --version    # verify
   ```

2. **Create a NEAR account** via near-cli-rs (testnet for experimentation, mainnet for production). Named accounts (e.g. `myorg.near`) can own subaccounts; implicit hex accounts cannot:
   ```bash
   near account create-account fund-my-account <your-account>.testnet use-faucet network-config testnet
   # or for mainnet, fund via a wallet transfer
   ```

3. **Generate a publish access key** — a function-call key scoped to the FastKV registry contract (`__fastdata_kv` on `dev.everything.near`). This is the key that signs `bos publish` transactions:
   ```bash
   bos key generate
   # Output includes: NEAR_PRIVATE_KEY=ed25519:...
   ```
   Add the key to your account via near-cli-rs (interactive keychain signing). Then set `NEAR_PRIVATE_KEY` in your `.env` or CI secrets.

4. **Update `bos.config.json`** — set `account` to your NEAR account and add `extends` to inherit the base platform:
   ```json
   {
     "extends": "bos://v1.citynode.near/citynode.app",
     "account": "<your-account>.near",
     "domain": "citynode.app"
   }
   ```
   Keep `domain` as `citynode.app` (the gateway). See "Same gateway, own account" below.

5. **Publish your config on-chain:**
   ```bash
   bos publish --deploy
   # builds workspaces → deploys to Zephyr CDN → publishes bos.config.json to FastKV at bos://<your-account>/citynode.app
   ```

6. **Deploy to Railway** — use the one-click template (button in `README.md`) or `railway up` with the committed `railway.toml` (which references the generic `ghcr.io/nearbuilders/everything-dev:latest` image). Set these environment variables on your Railway service:
   | Variable | Value |
   |----------|-------|
   | `BOS_ACCOUNT` | `<your-account>.near` |
   | `BOS_GATEWAY` | `citynode.app` |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |

7. **Your Railway host boots** `bos start`, fetches your published config from FastKV at `bos://<your-account>/citynode.app`, and serves your version live at the Railway-assigned URL. Changes take minutes, not hours.

**Same gateway, own account:**

`BOS_GATEWAY` (`domain` in `bos.config.json`) is the **FastKV lookup key**, not the DNS domain your Railway instance serves on. By keeping `BOS_GATEWAY=citynode.app` while using your own `BOS_ACCOUNT`, your config lives at a separate FastKV path (`bos://<your-account>/citynode.app`) that `extends` the base runtime (`bos://v1.citynode.near/citynode.app`). You inherit the full platform — host, API, auth, plugins — and override only what you change. Your Railway URL is the ingress; point your own domain's DNS at it if you want a custom domain.

**Setting up subaccount creation with near-cli-rs:**

The auth plugin's subaccount creation flow (used by the tenant wizard) requires a named NEAR account with a full access key. Implicit hex accounts cannot own subaccounts.

1. **Create a named NEAR account** via near-cli-rs (if you don't already have one):
   ```bash
   # testnet
   near account create-account fund-my-account <parent>.testnet use-faucet network-config testnet
   # mainnet — fund via wallet transfer first
   near account create-account fund-my-account <parent>.near manually-sign network-config mainnet
   ```

2. **Export the full access key** for that account (needed as `NEAR_SUB_ACCOUNT_PARENT_KEY`):
   ```bash
   near account export-account <parent>.testnet explicitly-provide-private-key network-config testnet
   ```

3. **Set the parent key secrets** in `.env`:
   ```
   NEAR_SUB_ACCOUNT_PARENT_KEY_MAINNET=ed25519:...
   NEAR_SUB_ACCOUNT_PARENT_KEY_TESTNET=ed25519:...
   ```

4. **Update `bos.config.json` auth variables** — point `siwn.subAccount.parentAccount`, `siwn.recipients`, and `siwn.relayer.*.whitelistedContracts` to your own account:
   ```json
   "variables": {
     "siwn": {
       "recipients": { "mainnet": "<your-account>.near", "testnet": "<your-account>.testnet" },
       "relayer": {
         "mainnet": { "whitelistedContracts": ["<your-account>.near"], "maxGasPerTransaction": "300000000000000", "maxDepositPerTransaction": "0" },
         "testnet": { "whitelistedContracts": ["<your-account>.testnet"], "maxGasPerTransaction": "300000000000000", "maxDepositPerTransaction": "0" }
       },
       "subAccount": {
         "mainnet": { "parentAccount": "<your-account>.near", "parentHasFullAccess": true, "minDeposit": "0.1 NEAR" },
         "testnet": { "parentAccount": "<your-account>.testnet", "parentHasFullAccess": true, "minDeposit": "0.1 NEAR" }
       }
     }
   }
   ```

5. After restarting, the auth plugin can create subaccounts (e.g. `chicago.<your-account>.near`) and the ephemeral relayer can relay transactions for your whitelisted contracts. Fund the relayer's implicit account with NEAR (see "SIWN Auth Relayer" below for the funding workflow).

**near-cli-rs quick reference:**

| Command | Purpose |
|---------|---------|
| `near account create-account fund-my-account <id> ...` | Create a new NEAR account |
| `near account list-keys <id> network-config <net> now` | List access keys on an account |
| `near account add-key <id> grant-function-call-access ...` | Add a function-call access key (used by `bos key generate`) |
| `near account delete-keys <id> public-keys <keys> ...` | Remove access keys |
| `near account export-account <id> explicitly-provide-private-key ...` | Export a full access key |
| `near contract call-function as-transaction <contract> <method> ...` | Submit a contract call (used internally by `bos key generate`; `bos publish` signs in-process via near-kit) |

The `bos` CLI wraps near-cli-rs for account and key management — you normally don't invoke `near` directly except for account creation and key export. `bos publish` signs its transaction in-process via near-kit; `bos key generate` handles publish-key minting.

## Code Changes

### Making Changes
- **Host Changes**: Edit `host/src/` when changing runtime resolution, auth wiring, SSR, proxying, or plugin mounting
- **UI Changes**: Edit `ui/src/` files → hot reload automatically
- **API Changes**: Edit `api/src/` files → hot reload automatically
- **CLI/Scaffolding Changes**: Edit `packages/everything-dev/` when changing init/dev/publish flows or child-project scaffolding
- **New Components**: Create in `ui/src/components/ui/`, export from `ui/src/components/index.ts`
- **New Routes**: Create file in `ui/src/routes/`, TanStack Router auto-generates tree

### Style Requirements
- Use semantic Tailwind classes: `bg-background`, `text-foreground`, `text-muted-foreground`
- No hardcoded colors like `bg-blue-600`
- No code comments in implementation
- Component file naming: lowercase kebab-case (`data-table.tsx`, `user-profile.tsx`)
- File/directory naming: kebab-case for all files and directories
- Follow existing patterns in neighboring files

### Adding API Endpoints
1. Define in `api/src/contract.ts` — the oRPC route definitions and Zod schemas
2. Implement in `api/src/index.ts` — the `createRouter` function
3. Use in UI via `apiClient` from `useApiClient()` in `@/app`

### Plugin Architecture

Business logic is organized into independent plugins loaded via Module Federation. A plugin entry in `bos.config.json` can be **remote-only** (no `development: local:…` key) — the host/API consume it via `pluginsClient` and HTTP, and types resolve from the deployed manifest (see "Generated types" below). Plugin source does not need to live in this repo.
- **`api/`** — Thin structural shell: ping, authHealth, error routes, middleware definitions
- **`plugins/apps/`** — Registry/discovery, FastKV app metadata (local in dev)
- **`plugins/_template/`** — Scaffold for creating new plugins
- **Auth** — Extended remote plugin from `bos://auth.everything.near` (Better-Auth, NEAR SIWN, organizations, API keys)
- **Proposals** — Remote-only plugin (production URL in `bos.config.json`); source lives in `NEARBuilders/nearbuilders.org`
- **Votes** — Remote-only plugin (production URL in `bos.config.json`); source lives in `NEARBuilders/nearbuilders.org`

Each plugin is self-contained with its own:
- `contract.ts` — oRPC route definitions and Zod schemas
- `index.ts` — `createPlugin` with variables, secrets, context, router
- rspack config for independent deployment

The UI accesses plugin routes via namespaced clients: `apiClient.registry.listRegistryApps()`, etc.

**Scoped resources**: For plugins using long-lived scoped resources (database pools, repository layers, caches, publishers), use `tools.buildService(tag, layer)` inside `initialize`. This binds resources to the plugin's lifecycle scope. Do NOT use `Effect.provide(Tag, Layer.scoped(...))` for persistent dependencies inside plugin `initialize` — it creates a transient scope that releases the resource immediately. Use `tools` (the third argument of `initialize`) to build scoped services.

### Plugin Client (pluginsClient)

The API plugin receives typed client factories for all other plugins via `createPlugin.withPlugins<PluginsClient>()`, enabling in-process composition without HTTP roundtrips.

**Two-phase loading**: The host loads non-API plugins first (Phase 1), creates a `pluginsClient` map, then loads the API with that map injected (Phase 2). The host is generic — no plugin-specific code.

**Generated types**: `api/src/lib/plugins-types.gen.ts`, `api/src/lib/auth-types.gen.ts`, `ui/src/lib/api-types.gen.ts`, and `ui/src/lib/auth-types.gen.ts` are generated by `bos types gen` from `bos.config.json`. These files are gitignored and auto-regenerated on `typecheck`, `bos dev`, `bos build`, and `bos pluginAdd`/`pluginRemove`.

Plugin types resolve in two ways:
- `local:plugins/<name>` → reads `src/contract.ts` directly from disk
- Remote URL → fetches bundled types from the deployed plugin manifest

If you hand-edit `bos.config.json`, run `bos types gen` or restart `bos dev` to regenerate.

## Parent vs Child

This repo is the parent platform, not a generated child project.

- Prefer changing `host/` and `packages/everything-dev/` when the request is about runtime resolution, domain routing, config loading, CLI behavior, or scaffolding.
- Prefer changing child project repos when the request is about project-specific content, shell navigation, or app-specific plugin composition.
- Do not assume the host is remote-only or out of tree; that is true for many child repos, not for this one.

## Changesets

**When to add a changeset:**
- Any user-facing change (features, fixes, deprecations)
- Breaking changes
- Skip for: docs-only changes, internal refactors, test-only changes

**Release flow:**
- CI is the validation workflow. On successful push to `main`, the Deploy workflow triggers automatically via `workflow_run` and checks out the exact SHA CI validated.
- `release.yml` is manual (`workflow_dispatch`): it consumes changesets, creates the `chore: version packages` PR when pending, and publishes to npm when no changesets remain.
- `deploy.yml` runs `bos publish --deploy`, publishes `bos.config.json` to FastKV, and redeploys Railway. Nothing is committed back — the runtime fetches the published config from FastKV.
- Generated child repos use a simpler flow: both Release and Deploy trigger directly from CI success via `workflow_run` (no npm publish, no Docker).

**Create changeset:**
```bash
bun run changeset
# Follow prompts to select packages and describe changes
```

## Testing & Quality

**Before committing:**
```bash
bun run test    # Run all tests (root script — NOT `bun test`, which uses Bun's native runner)
bun typecheck   # Type check all packages
bun lint        # Run linting
```

Host tests specifically use vitest via the workspace script:
```bash
bun run --cwd host test    # NODE_ENV=production BOS_CONFIG_PATH=../bos.config.json vitest run
```
Always use `bun run test` / `bun run --cwd host test` — never `bun test`, which invokes Bun's built-in runner and produces different (and misleading) results.

## Common Patterns

### Authentication Check
Routes requiring auth use `_authenticated.tsx` layout:
```typescript
export const Route = createFileRoute('/_layout/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } });
    }
  },
});
```

### API Middleware (Server-side)
Routes requiring auth use typed middleware that narrows the request context —
no non-null assertions needed:

```typescript
import { createAuthMiddleware } from "./lib/auth";

const { requireAuth } = createAuthMiddleware(builder);

builder.myRoute.use(requireAuth).handler(async ({ input, context }) => {
  context.userId; // string — narrowed by middleware
  context.user;   // RequestAuthUser — non-null after requireAuth
});
```

Available middlewares: `requireAuth`, `requireAuthOrApiKey`, `requireRole`,
`requireAdmin`, `requireOrganization`, `requireOrgRole`, `requireApiKey`.
Pass an optional Zod schema for org metadata: `createAuthMiddleware(builder, { orgMetaSchema })`.

### API Client Usage
```typescript
import { useApiClient } from "@/app";

function MyComponent() {
  const apiClient = useApiClient();
  const { data } = await apiClient.ping();
  const { data } = await apiClient.registry.listRegistryApps({ limit: 24 });
}
```

### App Name in UI
```typescript
import { getAppName } from "@/app";

// In a component (client-side only)
const appName = useClientValue(() => getAppName(), "app");

// In a head() function (server-side, from loaderData)
const { runtimeConfig } = Route.useLoaderData();
const appName = getActiveRuntime(runtimeConfig)?.title ?? getAccount(runtimeConfig);
```

### SIWN Auth Relayer (gasless NEP-366 relay)

The auth plugin's `siwn({ relayer: ... })` block in `bos.config.json → app.auth.variables.siwn` is **ephemeral mode** — the rich-object shape with `whitelistedContracts`, `maxGasPerTransaction`, and `maxDepositPerTransaction` but no `accountId` / `privateKey`. From the better-near-auth skill: that's `RelayerEphemeralConfig` ("Ephemeral with settings").

**Operational rules:**

- On first startup the server generates an ED25519 keypair per network, derives an implicit hex account from the public key, and encrypts the private key with `BETTER_AUTH_SECRET` (HKDF-SHA256 → AES-256-GCM) into the `relayerKey` table. Same keypair recovers on every restart.
- After first startup the server logs the implicit account id. **Fund that account with NEAR** to enable relay — otherwise every relay attempt fails with insufficient balance from the RPC.
- Funding workflow: admins hit `getRelayerInfo`; the `/admin/relayer` page surfaces a "needs funding" banner on `/admin` when `enabled === false` and `accountId` is set, then the admin's connected wallet transfers NEAR to the implicit account via `authClient.near.getNearClient().transfer()`.
- The implicit relayer account is *not* a `.near` named account, so it cannot own sub-accounts. `siwn.subAccount.parentAccount` must be a named account (this project uses `v1.citynode.near` / `v1.citynode.testnet`), and the parent key is supplied via `NEAR_SUB_ACCOUNT_PARENT_KEY_MAINNET` / `NEAR_SUB_ACCOUNT_PARENT_KEY_TESTNET` secrets. Without the parent key the sub-account endpoint explains why in the error message and returns a `not-configured` reason.
- `NEAR_RELAYER_PRIVATE_KEY` is vestigial in ephemeral mode and is omitted from `.env.example`. Only reintroduce (plus explicit `relayer: { accountId, privateKey }`) when moving to `RelayerExplicitConfig`.
- The mode is observable at runtime: `getRelayerInfo()` returns `{ accountId, mode: "ephemeral", publicKey, balance, enabled }`.

To switch to `RelayerExplicitConfig`, replace the rich-object shape with `relayer: { accountId: "relayer.<your-domain>.near", privateKey: process.env.RELAYER_PRIVATE_KEY, whitelistedContracts: [...], maxGasPerTransaction: "...", maxDepositPerTransaction: "0" }` and re-add the env var. The ephemeral key in the `relayerKey` table is ignored once an explicit key is provided.

## Security

### Shared Singleton Trust Model

Module Federation shares React, TanStack Query, and TanStack Router as singletons across remotes. A compromise of these packages affects all remotes simultaneously. Defense:

- **Catalog pinning** — versions are locked in root `package.json` catalogs. Bump versions deliberately, not reactively.
- **Renovate `minimumReleaseAge`** — 3 days general, 5 days for `@tanstack/*`. Malicious versions detected within hours are blocked from auto-merge.
- **Minor bumps never automerged** — supply chain attacks typically ship as minor version bumps. All minor updates require manual review.

### Dependency Security

- **Renovate** manages dependency updates for this parent repo (not Dependabot). Config: `.github/renovate.json`. New generated child repos no longer scaffold that config by default.
- **`--ignore-scripts`** — all CI workflows use `bun install --frozen-lockfile --ignore-scripts`. Lifecycle scripts (the TanStack attack vector) never execute during install.
- **Renovate `vulnerabilityAlerts`** — enabled in `.github/renovate.json`, opens PRs for dependencies with known vulnerabilities.
- **`bun audit`** runs in CI on every push, PR, and manual dispatch. It fails the build on critical/high findings only when the `AUDIT_STRICT=true` GitHub secret is set; otherwise it emits a warning.
- **GitHub Actions pinned to commit SHAs** — all `uses:` references are SHA-pinned to prevent tag-hijacking attacks (e.g. tj-actions).

### Supply Chain Incident Response

If a dependency is compromised:

1. **Catalog pin protects all remotes** — all workspaces resolve from the same catalog, so pinning one version secures everything.
2. **Independent deployment enables instant containment** — update the compromised remote's URL in `bos.config.json` and publish. No host rebuild needed.
3. **On-chain config is verifiable** — `bos.config.json` is published to FastKV. URL changes are inspectable and auditable on-chain.
4. **Runtime isolation limits blast radius** — a compromised UI dep cannot access API database secrets or auth keys. Remotes run in separate processes.

### CI Hardening

- No `pull_request_target` in any workflow — prevents the "Pwn Request" cache-poisoning pattern used in the TanStack compromise.
- Secrets scoped to individual steps, not job-level env — limits exposure if any step is compromised.
- `id-token: write` removed from job-level permissions — only granted where explicitly needed.
- `permissions:` set to minimum required on every workflow.

## Troubleshooting

**Process won't start:**
```bash
bos kill        # Kill all tracked processes
bun install     # Ensure dependencies
bun run dev     # Restart
```

**Module Federation errors:**
- Check `bos.config.json` URLs are accessible
- Verify shared dependency versions match in package.json
- Clear browser cache

**Database issues:**
```bash
bun run db:push   # Push schema changes
bun run db:studio # Open Drizzle Studio
```

## Environment

**Required files:**
- `.env` - Secrets (see `.env.example`)
- `bos.config.json` - Runtime configuration (committed)

**Key ports:**
- 3003 - UI dev server
- 3001 - API dev server

## Agent communication surface

The host exposes several surfaces for programmatic agent access:

| Surface | Endpoint | Auth | Use |
|---------|----------|------|-----|
| MCP | `POST /api/mcp` | `x-api-key` header or session cookie | MCP clients (Claude, etc.) — auto-generated tools from OpenAPI spec, stateless Streamable HTTP transport |
| REST/OpenAPI | `GET/POST/... /api/{path}` | `x-api-key` header or session cookie | Standard REST; Scalar docs at `GET /api`, spec at `GET /api/spec.json` |
| oRPC RPC | `POST /api/rpc/{procedure}` | `x-api-key` header or session cookie | Typed JSON-RPC for all API procedures |
| Plugin RPC | `POST /api/rpc/{plugin}/{procedure}` | `x-api-key` header or session cookie | Per-plugin RPC (e.g. `/api/rpc/auth/getSession`) |
| MCP discovery | `GET /.well-known/mcp.json` | None | JSON descriptor with server name, endpoint, and auth scheme |

### Authentication for agents

1. Sign in with your NEAR wallet (SIWN) at the website.
2. Navigate to **Settings → API Keys** at `/settings/api-keys`.
3. Create a new key — the full secret (`edk_...`) is shown once. Copy it immediately.
4. Pass it on every request: `x-api-key: edk_your_key_here`

The `x-api-key` header works for all API surfaces. The session middleware resolves the key via Better-Auth `getContext()`, populating `context.apiKey` with `{ id, name, permissions }`.

### MCP tool generation

The MCP server (`host/src/services/mcp.ts`) generates tools from the API's OpenAPI spec. The base API router composes all plugin routes (auth, registry, proposals, votes) via `pluginsClient`, so every API operation — including auth, NEAR SIWN, relay, and API key management — becomes an MCP tool. Auth context flows through `AsyncLocalStorage` into every tool invocation.

### Agent entry points (URL-served)

- `/llms.txt` — LLM overview (links to `/skill.md`)
- `/skill.md` — full agent skill prompt (two modes: talk via MCP, clone & modify)
- `/skill` — HTML rendering of skill.md
- `/.well-known/mcp.json` — MCP discovery descriptor
- `/api` — Scalar OpenAPI docs
- `/api/spec.json` — OpenAPI JSON spec

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`; published to GitHub (repo read fresh from `bos.config.json` `repository`) once ready. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles map to labels of the same name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files, with `docs/adr/` at the root for system-wide decisions. See `docs/agents/domain.md`.

### Workflow skills

This repo includes ~35 Matt Pocock workflow skills in `.agents/skills/`. These are general-purpose agent skills for TDD, code review, bug diagnosis, planning, and more. Run `/setup-matt-pocock-skills` before first use to configure the issue tracker, triage labels, and domain doc layout. Key skills:

- `/grill-with-docs` — sharpen an idea by interview, leaving a paper trail in `CONTEXT.md` and ADRs
- `/implement` — build a piece of work based on a spec or ticket, driving TDD internally
- `/code-review` — two-axis review (Standards + Spec) of the diff since a fixed point
- `/tdd` — test-driven development, red-green-refactor
- `/diagnosing-bugs` — diagnosis loop for hard bugs and performance regressions
- `/wayfinder` — chart a shared map of decision tickets for huge, foggy efforts

See `.agents/skills/ask-matt/SKILL.md` for the full flow map.

# City Nodes skill

Use this when you want an agent to run, edit, and publish the **City Nodes** app — local communities on NEAR, each with its own Node DAO, events and validator. City Nodes is an `everything.dev` app: it runs on the everything.dev runtime platform (Module Federation host + oRPC API + Better-Auth with NEAR SIWN) and is composed at runtime from `bos.app.ts`.

There are two ways to work with this app:

1. **Talk to the app** — use the API via MCP or REST to read/write data without cloning anything.
2. **Clone and modify** — clone the repository, run locally, edit code, and publish.

## Mode 1: Talk to the app

### MCP endpoint

The API is exposed as an MCP (Model Context Protocol) server at:

```
POST /api/mcp
```

Transport: Streamable HTTP (stateless, no session ID required).

Connect your MCP client to `{origin}/api/mcp` and it will discover all available tools automatically. Tools are generated from the API's OpenAPI spec — each API operation becomes a tool with typed input parameters.

### Authentication

All API operations require authentication. Use an **API key**:

1. Sign in with your NEAR wallet at the website (Sign-In-With-NEAR / SIWN).
2. Navigate to **Settings → API Keys** at `/settings/api-keys`.
3. Create a new key. The full secret (`api_...`) is shown once — copy it immediately.
4. Pass the key on every request:

```
x-api-key: api_your_key_here
```

This header works for `/api/*` (REST), `/api/rpc/*` (oRPC RPC), and `/api/mcp` (MCP).

### REST / OpenAPI

- **API docs UI**: `GET /api` (Scalar reference)
- **OpenAPI spec**: `GET /api/spec.json`
- **oRPC RPC**: `POST /api/rpc/{procedure}` (typed JSON-RPC)
- **Plugin RPC**: `POST /api/rpc/{plugin}/{procedure}` (e.g. `/api/rpc/auth/getSession`)

### MCP discovery

```
GET /.well-known/mcp.json
```

Returns a JSON descriptor with the server name, endpoint URL, and auth scheme.

### Available operations

The API exposes tenants, nodes, and validators:

- **Tenants**: list, create, update, delete, suspend, reactivate, resolve
- **Tenant bindings**: list, create, verify custom domain, set primary, resolve by hostname
- **Nodes**: list, get, create, update, delete, list root nodes, list children, resolve by slug
- **Validators**: list, get, create, update, delete, set default, resolve by account ID, resolve staking validators

Auth plugin operations (session, NEAR SIWN, relay, API keys, organizations) are available via `/api/rpc/auth/*`.

## Mode 2: Clone and modify

### TanStack Intent

- Registry entry: `https://tanstack.com/intent/registry/everything-dev`
- Load with TanStack Intent: `npx @tanstack/intent@latest load everything-dev`
- If the agent supports registry URLs directly, point it at the registry entry above.

### What this repo is

This repo is the **City Nodes runtime**, a child project of everything.dev. It contains the City Nodes product surface (UI, API, plugins); the host, CLI and plugin framework come from the published platform and the `everything-dev` and `every-plugin` packages.

- Work across `api/`, `ui/` and `plugins/` (`proposals`, `registry`) as needed. The host and the auth plugin come from the published everything.dev platform.
- The host is kept generic. UI is meant to be combined and put together. API aggregates plugins and is a plugin itself.
- **Remotes are not hosted APIs** — they are code bundles loaded via Module Federation at runtime. Everything runs in this runtime process, not on a remote server.
- `bos.app.ts` extends the published everything.dev platform and overrides only what City Node changes. Most work lands in `ui/src/`, `api/src/` and `bos.app.ts`.
- Files with a `FRAMEWORK-OWNED` header are reconciled from upstream on `bos upgrade`; read `AGENTS.md` before editing them.

### What this app is

- **City Nodes** is a network of local communities on NEAR. The product explanation lives at `/docs` (the overview); this section covers only what an agent needs to change code. Domain terms are defined in `CONTEXT.md` at the repo root.
- A **node** is a community tied to a place. Nodes form a tree through `parentId` (countries, states, cities; a city may also be top-level). Each node belongs to an organization (members and teams), has a Node DAO account, and can have its own subdomain (`chicago.citynode.app`).
- A **validator** is the staking target: `account_id`, `protocol` (today: NEAR), `role` (`official` or `community`), and `is_default`. A node with no validators inherits from its parent chain.
- The **platform tenant** (`v1.citynode.near`) serves `citynode.app` — the root directory. It has a tenant record but no node record; it is the deployment surface, not a place.
- `bos.app.ts` is the authored app descriptor; the published runtime config is canonicalized to JSON from it. The host loads UI, API, and auth at runtime from URLs in the published config.

### Read AGENTS.md first

After cloning, read **`AGENTS.md`** at the repo root. It contains:

- The TanStack Intent skills block (loadable skills for everything-dev, every-plugin, better-near-auth)
- Operational guidance: dev workflow, architecture, code changes, plugin architecture, testing, security
- Links to Matt Pocock workflow skills in `.agents/skills/` (TDD, code review, bug diagnosis, planning)
- Regression test instructions

### Simplified route structure

Public routes (no auth):

- `/` — landing: hero with Explore communities and Start a community, community stats, the directory of root communities, How it works, and links to `/apply` and `/docs`
- `/docs` — docs overview: what a City Node is, joining, staking and rewards, starting a community (i18n messages)
- `/docs/build` — builder hub linking the agent skill, `skill.md`, `llms.txt`, the API reference, MCP and the repository
- `/about` — redirects to `/docs`
- `/stake` — stake page: subtree validators with selector (official/community, `is_default` pre-selected)
- `/login` — sign-in page from the auth plugin
- `/skill` — renders this `skill.md`
- `/skill.md`, `/llms.txt` — raw doc endpoints
- `/$accountId` — NEAR account profile overview (public)

Authed routes (behind `_authenticated`):

- `/dashboard` — authenticated landing
- `/apply` — application form for an organization to start a community
- `/orgs` — Better-Auth organizations (node management orgs)
- `/settings/*` — user settings (profile, auth methods, security, API keys)
- `/admin/*` — admin surface: tenants, nodes, relayer, system (admin role only)

Keep `_layout` and `_authenticated` generic. Do not bake tenant-specific product concepts into the scaffold shell.

### Scaffold a new everything.dev app

Use `bos init` for new child apps.

```bash
bos init your-app.everything.dev \
  --extends dev.everything.near/everything.dev \
  --account your-account.near \
  --overrides ui \
  --no-interactive
```

If your installed `bos` version rejects `--no-interactive` or other expected init flags, use one of these fallbacks:

```bash
pnpm dlx everything-dev@latest init your-app.everything.dev
```

or run `bos init` interactively and answer the prompts.

### Run locally

```bash
cp .env.example .env
pnpm install
docker compose up -d --wait   # Start local Postgres
bos dev
```

Useful variants:

```bash
bos dev --api remote    # isolate UI work
bos dev --ui remote      # isolate API work
bos start --no-interactive   # production URLs
```

### Edit the UI

- main UI code lives in `ui/src/`
- routes live in `ui/src/routes/` (TanStack file-based router; `routeTree.gen.ts` regenerates automatically)
- reusable components live in `ui/src/components/` (`@/components` barrel) and `ui/src/components/ui/` (primitives like `data-table`, `button`, `select` — import these directly)
- runtime helpers live in `ui/src/app.ts` (`getAppName`, `getAccount`, `getActiveRuntime`, `getRuntimeConfig`, `useApiClient`, `useAuthClient`)
- use semantic Tailwind classes: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`. No hardcoded colors.

### Edit the API / plugins

- API contract: `api/src/contract.ts` (oRPC route definitions + Zod schemas)
- API router: `api/src/index.ts` (`createRouter`)
- Plugins live under `plugins/<name>/` with `contract.ts` + `index.ts` + rspack config
- UI calls plugins via namespaced clients: `apiClient.registry.listRegistryApps(...)`, `apiClient.proposals.getProposals(...)`, etc.

### Publish

```bash
bos build      # build selected workspaces
bos publish    # publish the current config to the FastKV registry (no build)
bos deploy     # full train: preflight → build → upload bundles → publish config → runtime image → Railway
bos upgrade    # upgrade framework packages and sync template files
```

Use `bos deploy` for a release. `bos publish` alone republishes the config without building.

### Regression tests

The regression suite under `tests/regression/` is Playwright browser specs (`tests/regression/browser/specs/`) plus Node unit tests for the harness (`tests/regression/lib/*.test.mjs`). The browser specs boot a real stack and cover sign-in and onboarding, organizer stations, admin, tenancy, community settings, stake scope and the docs pages. Keep them solid.

```bash
pnpm run test:regression:unit
pnpm run test:regression:browser   # dev:ssr stack; needs Postgres test databases, see tests/README.md
```

### Good tasks for an agent

- add or edit a public route under `_public/`
- wire a new API endpoint into `contract.ts` + `index.ts` and call it from the UI via `useApiClient()`
- add a node/validator admin flow under `_admin/`
- publish a UI update without changing the shared host
- debug why a tenant UI override is not loading

## Public entry points

- `/`
- `/docs`
- `/docs/build`
- `/apply` (redirects to `https://citynode.app/apply`)
- `/skill`
- `/skill.md`
- `/llms.txt`
- `/.well-known/mcp.json`
- `/.well-known/version` — deployed fingerprint + per-slot pins + last watch-tick outcome
- `/api` (OpenAPI docs)
- `/api/spec.json` (OpenAPI spec)
- `/api/mcp` (MCP server)

## Tone

Prefer product-first explanations for visitors (what a City Node is, why stake), and runtime-first explanations for builders (how the host, UI, and API compose from the published config). Keep NEAR and Module Federation context intact.

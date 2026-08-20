# City Nodes skill

Use this when you want an agent to run, edit, and publish the **City Nodes** app — a decentralized network of NEAR validator nodes organized by geography. City Nodes is an `everything.dev` app: it runs on the everything.dev runtime platform (Module Federation host + oRPC API + Better-Auth with NEAR SIWN) and is composed at runtime from `bos.config.json`.

## TanStack Intent

- Registry entry: `https://tanstack.com/intent/registry/everything-dev`
- Load with TanStack Intent: `npx @tanstack/intent@latest load everything-dev`
- If the agent supports registry URLs directly, point it at the registry entry above.

## What this app is

- **City Nodes** is a product, not a platform. The product surface: visitors browse a directory of geographic nodes (countries, states, cities), drill into a node's subdomain, and stake NEAR to that node's validator pool.
- A **node** is a NEAR validator tied to a real place. Each node has its own subdomain (`chicago.citynode.app`), its own NEAR treasury account, and 0..N validator pools. Nodes form a geography tree (country → state → city); a node's **subtree** aggregates validators for staking.
- A **validator** is the staking target: `account_id`, `protocol` (today: NEAR), `role` (`official` or `community`), and `is_default`. A node with no validators inherits from its parent chain.
- The **platform tenant** (`v1.citynode.near`) serves `citynode.app` — the root directory. It has a tenant record but no node record; it is the deployment surface, not a place.
- `bos.config.json` is the canonical runtime manifest. The host loads UI, API, and auth at runtime from URLs in the config.
- The host is the runtime shell and trust boundary. The UI is loaded through Module Federation. The API is loaded through `every-plugin`.

## Simplified route structure

Public routes (no auth):

- `/` — landing: "What are CityNodes?" hero + directory of root nodes + Apply button
- `/about` — renders the repo `README.md` (the CityNodes product explainer) via a README-fetching loader
- `/apply` — internal route that redirects externally to `https://citynode.app/apply`
- `/skill` — renders this `skill.md`
- `/skill.md`, `/README.md`, `/llms.txt` — raw doc endpoints
- `/things`, `/things/$thingId`, `/things/new`, `/things/live` — generic typed table demo (durable store + SSE)
- `/$accountId` — NEAR account profile overview (public)

Authed routes (behind `_authenticated`):

- `/login` — NEAR wallet sign-in entry (SIWN)
- `/dashboard` — authenticated landing
- `/stake` — stake page: subtree validators with selector (official/community, `is_default` pre-selected)
- `/orgs` — Better-Auth organizations (node management orgs)
- `/settings/*` — user settings (profile, etc.)
- `/admin/*` — admin surface: tenants, nodes, relayer, system (admin role only)

Keep `_layout` and `_authenticated` generic. Do not bake tenant-specific product concepts into the scaffold shell.

## Parent vs child repo

This repo is the **City Nodes app** running on the everything.dev runtime. The runtime platform itself (host, CLI, plugin framework) lives at [`NEARBuilders/everything-dev`](https://github.com/NEARBuilders/everything-dev).

- Here, work across `host/`, `api/`, `ui/`, `plugins/`, and `packages/` as needed — this repo contains the full runtime plus the City Nodes product surface.
- A generated child repo created by `bos init` works primarily in `ui/src/` and `bos.config.json`, inheriting the upstream host, auth, and API.
- Do not describe a generated child repo as the upstream runtime monorepo.

## Scaffold a new everything.dev app

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
bunx everything-dev@latest init your-app.everything.dev
```

or run `bos init` interactively and answer the prompts.

What this gives you:

- a fresh app directory with `bos.config.json`
- a local `ui/` workspace to customize
- the shared host, auth, and API inherited from the base runtime
- the current parent UI scaffold as a starting point

Keep these route boundaries intact:

- `ui/src/routes/_layout.tsx`
- `ui/src/routes/_layout/login.tsx`
- `ui/src/routes/_layout/_authenticated.tsx`

## Run locally

```bash
cp .env.example .env
bun install
bos dev
```

Useful variants:

```bash
bos dev --api remote    # isolate UI work
bos dev --ui remote      # isolate API work
bos start --no-interactive   # production URLs
```

## Edit the UI

- main UI code lives in `ui/src/`
- routes live in `ui/src/routes/` (TanStack file-based router; `routeTree.gen.ts` regenerates automatically)
- reusable components live in `ui/src/components/` (`@/components` barrel) and `ui/src/components/ui/` (primitives like `data-table`, `button`, `select` — import these directly)
- runtime helpers live in `ui/src/app.ts` (`getAppName`, `getAccount`, `getActiveRuntime`, `getRuntimeConfig`, `useApiClient`, `useAuthClient`)
- use semantic Tailwind classes: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`. No hardcoded colors.

## Edit the API / plugins

- API contract: `api/src/contract.ts` (oRPC route definitions + Zod schemas)
- API router: `api/src/index.ts` (`createRouter`)
- Plugins live under `plugins/<name>/` with `contract.ts` + `index.ts` + rspack config
- UI calls plugins via namespaced clients: `apiClient.template.listThings(...)`, `apiClient.registry.listRegistryApps(...)`, etc.

## Publish

```bash
bos build               # build all packages (updates bos.config.json)
bos publish             # publish config to the FastKV registry
bos publish --deploy    # build/deploy all workspaces, then publish
bos sync                # sync from upstream
```

After `bos publish --deploy`, `bos.config.json` gets deployed URLs + integrity.

## Good tasks for an agent

- add or edit a public route under `_public/`
- wire a new API endpoint into `contract.ts` + `index.ts` and call it from the UI via `useApiClient()`
- add a node/validator admin flow under `_admin/`
- publish a UI update without changing the shared host
- debug why a tenant UI override is not loading

## Public entry points

- `/`
- `/about`
- `/apply` (redirects to `https://citynode.app/apply`)
- `/skill`
- `/skill.md`
- `/README.md`
- `/llms.txt`

## Tone

Prefer product-first explanations for visitors (what a City Node is, why stake), and runtime-first explanations for builders (how the host, UI, and API compose from `bos.config.json`). Keep NEAR and Module Federation context intact.

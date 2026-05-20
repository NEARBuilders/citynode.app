# everything.dev skill

Use this when you want an agent to scaffold, run, edit, and publish an `everything.dev` app or a tenant UI that extends a base runtime.

## TanStack Intent

- Registry entry: `https://tanstack.com/intent/registry/everything-dev`
- Load with TanStack Intent: `npx @tanstack/intent@latest load everything-dev`
- If the agent supports registry URLs directly, point it at the registry entry above.

## What this project is

- `everything.dev` is a runtime-composed app platform on NEAR.
- `bos.config.json` is the canonical runtime manifest.
- The host is the runtime shell and trust boundary.
- The UI is loaded at runtime through Module Federation.
- The API is loaded at runtime through `every-plugin`.

## Parent vs child repo

Be explicit about which repo you are editing.

- In the parent `everything.dev` repo, work across `host/`, `api/`, `ui/`, `plugins/`, and `packages/`.
- In a generated child repo created by `bos init`, work primarily in `ui/src/` and `bos.config.json`.
- Do not describe a generated child repo as the upstream runtime monorepo.
- A UI-only child tenant inherits the upstream host, auth, and API unless it explicitly overrides more surfaces.

## White-label starter app contract

The default scaffold should stay generic.

- `ui/src/routes/_layout.tsx` is the public shell boundary.
- `ui/src/routes/_layout/login.tsx` is the login entry.
- `ui/src/routes/_layout/_authenticated.tsx` is the auth gate.
- routes under `ui/src/routes/_layout/_authenticated/` are protected pages.
- app-specific branding, navigation, and concepts should stay outside that contract.

This lets different apps keep their own style system and product language while preserving the same route and auth structure.

## Core model

- The base runtime owns the shared host, auth, API, and base plugin set.
- Tenant apps extend that base runtime and override UI-facing pieces.
- In fixed-core mode today, tenants can override:
  - `app.ui`
  - existing `plugins.<id>.ui`
  - existing `plugins.<id>.sidebar`
- In fixed-core mode today, these stay fixed to the base runtime:
  - `app.host`
  - `app.api`
  - `app.auth`
  - server-side plugin loading and router mounting

## Super app mental model

- bare domain -> base runtime
- `extends` -> lineage edge
- `account` -> tenant namespace root for the active runtime
- `domain` -> public ingress for that runtime
- subdomains compose onto the active runtime account namespace
- tenant config must extend the base runtime
- tenant UI integrity must be present for trusted overrides

Example:

- `bos://dev.everything.near/everything.dev` is the base runtime
- `bos://pizza.pingpayio.near/pizza.com` can extend `bos://pingpayio.near/pingpay.io` and still become its own tenant root on `pizza.com`
- `bos://chicago.pizza.pingpayio.near/pizza.com` is a descendant runtime inside the `pizza.pingpayio.near` namespace

## Scaffold a UI-only tenant starter

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

Current caveat:

- today the scaffold may still copy showcase routes from the parent UI
- for a true white-label child app, treat those routes as starter material to replace, not as the final app shape

## Run locally

```bash
cp .env.example .env
bun install
bos dev --host remote
```

Useful variants:

```bash
bos dev --host remote --api remote
bos start --no-interactive
```

## Edit the UI

- main UI code lives in `ui/src/`
- routes live in `ui/src/routes/`
- reusable components live in `ui/src/components/`
- runtime helpers live in `ui/src/app.ts`
- root document wiring lives in `ui/src/routes/__root.tsx`
- use semantic Tailwind classes such as `bg-background`, `bg-card`, `text-foreground`, and `text-muted-foreground`

For the default starter app:

- keep `_layout` and `_authenticated` generic
- keep `user-nav` generic
- avoid baking tenant-specific product concepts into the scaffold shell

Canonical starter shell recipe:

- keep one public landing page at `/`
- keep `/about` and `/skill` as public documentation routes
- keep one authenticated landing page under `_authenticated/`
- simplify navigation before adding app-specific sections
- remove showcase routes such as projects, organizations, apps, or settings unless the child app actually needs them

## Post-init cleanup for `--overrides ui`

After scaffold:

- replace copied showcase routes with starter routes
- remove non-essential demo routes if present
- update `README.md`, `AGENTS.md`, and `skill.md` to describe the child app, not the parent runtime repo
- replace placeholder `account`, `domain`, `title`, and `description`
- keep the shared runtime relationship clear in `bos.config.json`

## Generated types in UI-only children

- `bos types gen` may still generate API and auth client types in a UI-only child
- those types can come from the upstream remote runtime
- the absence of a local `api/` workspace is normal for a UI-only tenant
- if your local installed CLI version behaves differently from the latest framework code, prefer `bunx everything-dev@latest` while validating the scaffold flow

## Verify the child app

Recommended success criteria:

```bash
bun run types:gen
bun run typecheck
bun run lint
```

## Publish a tenant UI

```bash
bos publish --deploy
bos publish
```

After `bos publish --deploy`, the child app `bos.config.json` gets the deployed UI URL and integrity.

## Tenant runtime rules

- publish the base runtime first
- publish the tenant runtime that extends it
- use your own NEAR account in `account`
- keep the same gateway or domain when you want the shared-host tenant model
- tenant SSR is gated by `TENANT_WHITELIST` unless `ALLOW_UNTRUSTED_SSR=true`

## Host env for fixed-core tenant mode

```bash
NETWORK_ID=mainnet
ALLOW_OVERRIDE=ui,plugins.*
TENANT_WHITELIST=your-account.near
ALLOW_UNTRUSTED_SSR=false
```

## Good tasks for an agent

- scaffold a white-label starter app with `bos init --overrides ui`
- explain runtime inheritance and fixed-core tenant behavior
- wire new pages into the `_layout` and `_authenticated` route structure
- publish a tenant UI without changing the shared host
- debug why a tenant UI override is not loading

## Public entry points

- `/`
- `/about`
- `/skill`
- `/skill.md`
- `/README.md`
- `/llms.txt`

## Tone

Prefer runtime-first explanations.
Treat the project as a living runtime surface, not a fixed demo.
Keep NEAR and Module Federation context intact.

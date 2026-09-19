# Implementation Plans

Design documents for the everything.dev v2 platform. These are architecture
and implementation plans, not issue tickets — sprint tickets live in
`.scratch/<feature>/issues/` (local, published to GitHub once ready).

## Directory structure

```
plans/
├── beta-v2/          # v2 platform architecture (5 docs)
├── extensions/       # plans that extend the beta-v2 architecture
├── infra/            # infrastructure & migration plans
├── offline/          # offline support (SW caching + data sync queue)
├── v1-current/       # plans about the current v1 system
├── prototypes/       # runnable prototype source code (2 prototypes)
└── wayfinder/        # decision map + open question tickets for beta-v2
```

## beta-v2 — the v2 platform architecture

The `app.ts` composition model: one TypeScript file declares the entire
application — auth, API, web plugins, native plugins. The host composes
them at runtime via Module Federation. Tenants override by URL. Everything
is verifiable on-chain via FastKV.

| Document | Covers |
|---|---|
| [overview.md](./beta-v2/overview.md) | Entry point — vision, `app.ts` surface, plugin model, 9-phase rollout |
| [composable.md](./beta-v2/composable.md) | Code-based composition — `App()`, `Plugin()`, `WebPlugin()`, `NativePlugin()` constructors, type system, Effect integration |
| [ui.md](./beta-v2/ui.md) | Web plugin architecture — TanStack Router, mount points, `composeApp()`, grafting, SSR |
| [tenants.md](./beta-v2/tenants.md) | Tenant model — three tiers, sandboxing, data isolation, verifiable deployment graph |
| [native.md](./beta-v2/native.md) | Native (React Native) target — Re.Pack, React Navigation, native plugin structure, token auth, migration guide |

## extensions — plans extending beta-v2

| Document | Covers | Status |
|---|---|---|
| [ui-route-grafting-migration.md](./extensions/ui-route-grafting-migration.md) | In-repo migration to grafting ui plugins — SSR corrections (session-forwarded, not exclusion), digest-cached composition, shell/nav mounts, `plugins.<id>.ui` schema extension, phases 1–3 | **DECIDED** — Phases 1–3 approved; supersedes route-level composition; see map issue [citynode.app#108](https://github.com/NEARBuilders/citynode.app/issues/108) |
| [ui-extends-ui-federation.md](./extensions/ui-extends-ui-federation.md) | UI-to-UI composition through `extends` — child UI inherits routes/components from parent UI via MF | **SUPERSEDED** — route-level composition rejected; see [ui-route-grafting-migration.md](./extensions/ui-route-grafting-migration.md) |
| [client-runtime-plugins.md](./extensions/client-runtime-plugins.md) | Browser-executed plugins — `runtime: "client"` field, wasm-git + OPFS storage, BunInBrowser proxy | Independent |

## infra — infrastructure & migration

| Document | Covers | Status |
|---|---|---|
| [toml-infra-alchemy.md](./infra/toml-infra-alchemy.md) | TOML config, per-plugin Postgres schema isolation, `[infra]` section, Alchemy database provisioning | Phases 1–3 DONE, Phase 4 PARTIAL |
| [orpc-v2-effect-migration.md](./infra/orpc-v2-effect-migration.md) | oRPC V1→V2 upgrade + Effect integration — Layer-based `initialize`, `.effect()` handlers, `errorStatusMap` | **DONE** — merged to `main` (citynode.app#97 + #106), verified live in production including the MF shared-dep guardrails |
| [effect-native-plugins.md](./infra/effect-native-plugins.md) | Effect-native plugins — `.effect()` handlers, Layer-returning `initialize`, nested router merging, `every-plugin` barrel removal | **DONE** — merged with citynode.app#97; deployed to production |

## offline — offline support

| Document | Covers | Status |
|---|---|---|
| [shell-sw-caching.md](./offline/shell-sw-caching.md) | Layer 1: service worker for MF asset caching — offline shell rendering | Pairs with [data-sync-queue.md](./offline/data-sync-queue.md) |
| [data-sync-queue.md](./offline/data-sync-queue.md) | Layer 2: offline request queue & replay via IndexedDB + Background Sync | Builds on [shell-sw-caching.md](./offline/shell-sw-caching.md) |

## v1-current — plans about the current system

| Document | Covers | Status |
|---|---|---|
| [tenant-feature-completeness.md](./v1-current/tenant-feature-completeness.md) | Tenant lifecycle hardening — edit/delete flows, soft-delete, status gating, auth consistency | Independent |
| [every-plugin-db-auth-absorption.md](./v1-current/every-plugin-db-auth-absorption.md) | Per-plugin database boilerplate absorption — `everything-dev/db` runtime exports (`createDatabaseDriver`/`databaseLayer`/`runMigrations`), namespace-per-engine isolation, tiered migration timing (ticket #89) | DECIDED (amended 2026-09-15) — prototype at [prototypes/db-auth-absorption/](./prototypes/db-auth-absorption/), build plan 017 in [advisor-plans/](../../advisor-plans/) |

## prototypes — validated architecture

| Prototype | Validates | Related docs |
|---|---|---|
| [beta-v2/](./prototypes/beta-v2/) | Web plugin grafting — `composeApp()` grafts MF remote route trees into host mount points | [ui.md](./beta-v2/ui.md) |
| [beta-v2-override/](./prototypes/beta-v2-override/) | Tenant UI override composition — host composes base + tenant override remotes | [tenants.md](./beta-v2/tenants.md), [ui-extends-ui-federation.md](./extensions/ui-extends-ui-federation.md) |
| [db-auth-absorption/](./prototypes/db-auth-absorption/) | Database absorption — plugin-id plumbing, slug semantics, schema isolation, migration idempotence, R-channel narrowing | [every-plugin-db-auth-absorption.md](./v1-current/every-plugin-db-auth-absorption.md) |

## wayfinder — decision map for beta-v2

| Document | Covers |
|---|---|
| [beta-v2-map.md](./wayfinder/beta-v2-map.md) | Decision map — registry & FastKV architecture, namespace model, caching layers, gateway services, platform services (decisions 11–17: deploy service, provider-as-alchemy-program, OTA runtime, sandboxes, upstream strategy) |
| [tickets/](./wayfinder/tickets/) | 11 decision tickets (6 resolved, 1 partially resolved, 4 open) |

### Ticket status

| Ticket | Question | Status |
|---|---|---|
| [01-route-grafting.md](./wayfinder/tickets/01-route-grafting.md) | Web plugin grafting strategy | **RESOLVED** — proven by [beta-v2 prototype](./prototypes/beta-v2/) |
| [02-typed-api-client.md](./wayfinder/tickets/02-typed-api-client.md) | Typed `apiClient` for MF remotes | **RESOLVED** — proven by [override prototype](./prototypes/beta-v2-override/) |
| [03-plugin-type-deeps.md](./wayfinder/tickets/03-plugin-type-deps.md) | Plugin-to-plugin type dependencies | Open |
| [04-app-ts-evaluation.md](./wayfinder/tickets/04-app-ts-evaluation.md) | `app.ts` evaluation to deployable config | Open — sharpened by the deploy service (URL write-back may dissolve) |
| [05-backwards-compat.md](./wayfinder/tickets/05-backwards-compat.md) | Host supports both `app.ts` and `bos.config.json` | Open |
| [06-ssr-per-request.md](./wayfinder/tickets/06-ssr-per-request.md) | Per-request SSR route tree composition | **PARTIALLY RESOLVED** — SSR-by-exclusion proven; now also gates member subdomains |
| [07-effect-idiomatic.md](./wayfinder/tickets/07-effect-idiomatic.md) | Effect.ts idiomatic `createPlugin` | **RESOLVED (direction)** — `@orpc/experimental-effect` shipped with oRPC v2 beta; sequenced first on the `v2` branch |
| [08-extends-depth.md](./wayfinder/tickets/08-extends-depth.md) | Transitive `extends` chains | **RESOLVED** — multi-level, verified per hop, depth-capped at 5, publish-time flattening |
| [09-stitching-order.md](./wayfinder/tickets/09-stitching-order.md) | Grafting vs UI-extends-UI sequencing | **RESOLVED** — grafting first (validated); inheritance is a layer on top, prototype-gated |
| [10-hot-swap-lifecycle.md](./wayfinder/tickets/10-hot-swap-lifecycle.md) | OTA hot-swap lifecycle (in-flight requests, teardown, ESM disposal) | Open — prototype required |
| [11-sandbox-db.md](./wayfinder/tickets/11-sandbox-db.md) | Sandbox database engine | **RESOLVED** — tiered PGlite (workshop) / Neon via alchemy (production) |

## Completed plans (removed)

| Plan | Title | Outcome |
|---|---|---|
| 003 | Require `API_DATABASE_URL` in production | Implemented in v2.7.4, then reverted in v2.7.5 (pglite guard removed) |
| 006 | Add warnings to empty catch blocks | Implemented in v2.7.4 |
| 007 | Add CSRF protection to state-changing endpoints | Implemented in v2.7.4 — lives in `host/src/middleware/security.ts` |
| react-native-migration | React Native migration plan | Folded into [native.md](./beta-v2/native.md) — architecture + implementation guide merged |

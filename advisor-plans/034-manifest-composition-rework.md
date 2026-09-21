# Plan 034: Manifest composition rework — `feat/auth-ui-plugin` lands manifests and deletes grafting 100%

## Status

TODO. GATED BY plan 033 (all seven must-pass gates). Decisions: [ADR 0007](../docs/adr/0007-runtime-composition-ssr.md) + [ADR 0008](../docs/adr/0008-manifest-composition.md). Read both, plus 033's Results, before starting.

## Why this matters

PR #134 (plan 024) proved the auth-ui carve-out end to end but paid for it with a 24-commit composed-SSR failure chain (ADR 0007's C1–C3). The committed end state is manifest composition as the SINGLE model — no grafting ships anywhere, ever again, and no fallback path is maintained. Main stays green (core-only SSR) until this plan lands; no interim dual-path state exists. The branch may be reverted in portions: grafting is deleted, not hardened.

## Git workflow

Work on `feat/auth-ui-plugin` (worktree `citynode.app.v1.auth-ui`, base `f572191d`). This plan reworks the branch in place; it does NOT stack on a merge of #134. Closing #134 in favor of this branch's successor PR is the operator's call at review time.

## Keep from #134 (load-bearing regardless of composition model)

- The mv-first carve-out: login/settings in `plugins/auth/ui` (git history preserved), components/lib kit, zero-token-CSS styles.
- Config seam: `app.auth.ui` flat key → `RuntimeConfig.plugins` mirror; compose/digest/hydrate/tenant-override plumbing; `plugins.auth.ui.*` deploy write-back; backend dedup guards in service-descriptor/dev-session/planner/host entryMap.
- rsbuild environments modernization: web + node env via the official `@module-federation/rsbuild-plugin` (remotes still need client `remoteEntry.js` + server bundles), `createUiSharedDeps` strict singletons, crossorigin hardening.
- Effect-native load pipelines, SRI verification, federation cache (becomes the `SsrFederation` L1 service — see below).

## Delete entirely (the deletion commit — server AND client)

- `packages/everything-dev/src/ui/compose/` graft paths: `composeApp` graft/copy logic, `graftCopy` (incl. the `BaseRoute.init` re-implementation), `collectCoreMounts`, `resolveCoreMount` + gate-strength machinery (obsolete — registry v2 has no overlapping mounts), `deriveMountId`/`declaredSegment`, `defineUiPlugin` + its WeakMap associations, `MOUNT_REGISTRY` v1.
- `plugins/auth/ui/src/tree.ts` and the `./tree` expose.
- Client graft compose: `ui/src/hydrate.tsx` `composeClientPluginTrees` (+ its `[DIAG]` logs) — replaced by manifest-driven hydration.
- `pluginPath`/`pluginHref`/`pluginSearch` seam (`ui/src/lib/plugin-path.ts`) — replaced by generated merged route types.
- Dev SSR machinery: `ui-ssr`/`plugin-ui-ssr:<id>` services, `uiSsr` port allocation + claimPorts + dev-session bookkeeping, planner/app.ts `ssrUrl` patching, `dev:ssr` scripts, `SSR_LOG_ALLOWLIST`/STARTUP_ORDER entries, the regression SSR readiness probe + `REGRESSION_SSR_PROBE_TIMEOUT_MS`.

## Add

1. **Generator in `every-plugin` build** (033's `generator/` productionized): scans `src/routes/`, emits `manifest.gen.json` + `route-config.gen.ts`, validates (registry-v2 mounts, unique paths, thin `__root`, file-based-only), watches in dev, rides `EmitPluginManifest` for emission timing. `routeTree.gen.ts` stays for plugin-local standalone DX only.
2. **Host construction service** (033's host, productionized): manifests + route-configs → host-built tree via `createRoute`/`createLazyRoute`; gates from `shared/mount-registry` attached host-side; `__root` head/staticData lifted; digest-cached per resolved config; Effect-modeled per ADR 0007 §7. Prototype findings now part of the contract: (a) **mounts are constructed only when a plugin declares them** — a childless pathless mount is a leaf branch matching `/` and competes with index routes; (b) the generator **errors when a `_mount/…` route file exists without its `_mount.tsx` layout file** (the file IS the declaration — the scan yields no parent node without it); (c) pathed routes cannot take a custom id — namespacing applies to pathless layouts only.
3. **`SsrFederation` Layer** — one process MF instance (L1), share-scope-once (acquisition + re-register), L2 in-place re-register on integrity bump, L3 per-variant freshness via `bypassModuleCache`. Consolidates #134's shared-instance work.
4. **Mount registry v2** (`public/authenticated/admin/org/team`, gates only) + migration aliases (`_dashboard`→`authenticated`, `_organization`→`org`, `_auth`→`authenticated`). `MOUNT_REGISTRY_VERSION` bump → all compose digests invalidate once.
5. **Route migration in `plugins/auth/ui`**: `_public.tsx` mount (login moves here with its route-level reject-authed `beforeLoad`); `_dashboard/**` → `_authenticated/**` (settings subtree); delete `defineUiPlugin` usage; regenerate manifests.
6. **Dev source-manifest path**: `bos dev --ssr` composes from disk manifests/route-configs — one module graph, no MF in the server path, cache-bust re-import on watch; SSR off by default; loud error if `--ssr` requested and manifests missing.
7. **Health gate**: boot compose failure fails the health endpoint (deploy rolls back); CSR shell remains the per-request tenant-gate failure path only.
8. **`bos types gen` merged route types** from manifests (typed cross-plugin `<Link>`; replaces `plugin-path.ts`). If the generator stretch didn't land in 033, this may ride a follow-up — flag it.

## Steps

0. **Share-scope probe (bounded, first)** — on the real rspack-bundled host, BEFORE porting anything: load ONE auth-ui `routeConfig` expose through the existing composition instance and render a hook-using remote component (`useRouter`). Crash signatures are the diagnostic table below. PASS = hook-using remote component renders inside one React; then SSR of `/login` server-renders. This retires plan 033's one residual (plain-runtime hosts can't fully negotiate provides — the bundled host's build-level shared config is the proven provider, #134 prod smoke). STOP if the probe fails for reasons not in the table.
1. Port `shared/` types + generator from the prototype into `packages/everything-dev` (+ `every-plugin` build step). Unit tests: scan → manifest golden fixtures.
2. Rework the auth plugin routes to registry v2; delete `tree.ts`/`defineUiPlugin`; regenerate.
3. Host: replace compose graft with construction; wire `SsrFederation` Layer + digest cache + health gate; delete the dev SSR machinery list above.
4. Client: manifest-driven hydration replacing `composeClientPluginTrees`; digest parity check retained (config digest in HTML ↔ client fingerprint).
5. Migrate `plugins/_template` if it carries a ui tree (post-#121 it does not — verify).
6. Regression suite: dev mode = source-manifest SSR, no probes, no extra servers; prod mode unchanged (`bos start`, published config).

## Test plan

- Everything-dev: compose-package tests replaced by construction/manifest tests (golden fixtures, mount validation, registry version).
- Host: ssr-render/federation-cache/ui-compose suites re-encoded for construction invariants (one instance per process, digest invalidation, health-gate failure); ssr-fallback tests re-encode the CSR-shell-only-tenant path.
- auth-ui plugin: routes serve under new mounts (`/login` on `_public`, `/settings/*` on `_authenticated`); reject-authed redirect verified server-side.
- Regression: `bun run test` (regression, dev mode) green WITHOUT the readiness probe; `REGRESSION_MODE=prod` spot-run as the final verdict.

## Verification gates

- `bun typecheck` (9/9), `bun lint`, per-workspace suites, host suite (`bun run --cwd host test` — the 2 known deploy-gated `runtime-remote` failures remain out of scope per advisor-plans README).
- Compose digest invalidation verified once (registry version bump).

## Done criteria

- Zero graft machinery in the tree (`grep -r graftCopy`, `defineUiPlugin`, `./tree` → no production hits).
- Dev regression green without any SSR dev server or probe.
- Prod spot-run green (auth plugin deployed, SSR of `/login` server-renders, tenant override composes per digest).
- `/login` renders under `_public` with the reject-authed redirect working server-side.

## STOP conditions

- Any gate from 033 regresses under the real plugin's complexity in a way that changes the design — stop, report, re-prototype if needed.
- `route-config.gen.ts` cannot express a real auth-plugin route option (e.g., a loader needing request-scoped context) — report; the contract changes before proceeding.
- Digest parity (server composed tree ↔ client manifest fingerprint) cannot be made reliable — report; do not ship silent core-only fallback as the norm.

## Maintenance notes

- **MF node-SSR + share-scope crash-signature table** (prototype + #134 evidence — the executor's diagnostic when the Step 0 probe or any composed load fails):
  | Signature | Cause | Fix |
  |---|---|---|
  | `Unexpected keyword 'export'` loading a node entry | node recipe not activated — container emitted ESM | pass the plugin's SECOND argument: `pluginModuleFederation(opts, { target: "node", environment: "node" })` (environment name alone is insufficient); `filename: "remoteEntry.server.js"` |
  | `Invalid hook call` / `ReactSharedInternals.H.useContext of null` | two Reacts — the remote bundled a private copy | SSR remote shared must NOT be `eager` (eager inlines); host must provide react/react-dom/@tanstack as singleton shares |
  | `factory is not a function … instance of Module` | share-scope provides in module-direct format | webpack protocol wants the FACTORY THUNK: `get: async () => () => import("react")` |
  | `createRootRoute` undefined after share replacement | container module-init order broken by post-hoc share injection on a PLAIN runtime host | prototype-only artifact — the rspack-bundled host provides shares at build time (native `__webpack_require__.S`); this signature on the real host means the build's shared config is wrong |
  | L1 invariants (always) | — | one instance per process; `initializeSharing("default")` returns a promises ARRAY → `Promise.all`; init before EACH load; `loadRemote(expose, { from: "build" })`; unwrap `.default` |
- **`app.ts` filename collision (plan 028):** `packages/everything-dev/src/app.ts` already exists — the runtime-config builder/port-allocator (imported by `plugin.ts` for `bos dev`). Plan 028 must rename it (e.g. `runtime-config-builder.ts`) before/when landing the authored descriptor.
- This plan intentionally merges the previously sketched "033 trim" work: there is no trim-only landable unit, because dropping grafting 100% leaves no composed-SSR interim. One unit, prototype-gated.
- Build-time bake stays a cold-start optimization note only (ADR 0007); do not implement here.
- Ticket 06 note: member-subdomain SSR resolution is deferred feature work; the digest cache subsumes N config layers.

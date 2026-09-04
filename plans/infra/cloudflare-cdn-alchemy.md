# Cloudflare R2 CDN via Alchemy (Pluggable Deploy Provider)

Supersedes Phase 4 of [toml-infra-alchemy.md](./toml-infra-alchemy.md) (Neon
database provisioning is deferred; that content is preserved there as a
deferred reference). Approved 2026-09-03.

## Problem

Zephyr Cloud is the sole CDN provider for every Module Federation remote
bundle (ui, ui-ssr, api, host, local plugins). This creates:

- **Operational friction** — a documented history of Cloudflare-to-Zephyr
  proxy failures (Error 1000 "DNS points to prohibited IP", 403s on
  orange-clouded URLs) requiring multiple host proxy/redirect rewrites
  (see `host/CHANGELOG.md`, `ui/CHANGELOG.md`).
- **CI secret sprawl** — `ZEPHYR_AUTH_TOKEN` / `ZEPHYR_CI_TOKEN` /
  `ZEPHYR_USER_EMAIL` juggling in every deploy workflow and template.
- **Single point of failure** — no fallback if Zephyr is unavailable
  during a deploy window.

Meanwhile [Alchemy](https://alchemy.run) v2 (Effect-based — same stack as
this repo) now has first-class Cloudflare support: R2 buckets with custom
domains, CORS, and lifecycle rules as declarative resources; zone
adoption; Actions for deploy-time work. This plan makes Cloudflare R2 the
primary CDN, managed via an Alchemy-generated deploy program, with Zephyr
retained as a selectable fallback.

## Goal

Target topology:

```
Railway (unchanged)          Cloudflare via Alchemy (new)          FastKV (unchanged)
┌──────────────────┐         ┌───────────────────────────┐        ┌──────────────┐
│ Host Docker      │  loads  │ R2 bucket                 │        │ bos.config   │
│ (bos start,      │◄─HTTPS─ │ custom domain:            │        │ .json with   │
│  Hono+oRPC,      │  SRI    │   cdn.<config.domain>    │        │ R2 URLs +    │
│  MF host, runs   │         │ CORS: GET/HEAD *          │        │ sha384 SRI   │
│  api+ui plugins  │         │ ui/ api/ plugins/...      │        └──────────────┘
│  in-process)     │         │ (remoteEntry.js + chunks) │
└──────────────────┘         └───────────────────────────┘
```

1. **Pluggable CDN provider** — `[deploy] cdn = "cloudflare" | "zephyr"`
   in `bos.config.json`. Absent → `"zephyr"`, so generated child repos and
   self-deployers keep zero-config deploys.
2. **Cloudflare R2** as the CDN for all MF remote bundles: one bucket,
   custom domain `cdn.<bos.config.json domain>` (default), path-based
   URLs (`https://cdn.<domain>/<workspace>/remoteEntry.js`).
3. **Alchemy deploy pipeline** — `bos publish --deploy` generates an
   `alchemy.run.ts` from `[deploy]` that provisions the bucket/domain and
   uploads each workspace's `dist/` as deploy-time Actions.
4. **Railway keeps the whole app** — the host Docker container executes
   api/ui/plugin MF remotes in-process. CDN-only change; no Workers
   rewrite. Database stays on Railway Postgres.

## Why this is cheap: the provider-agnostic seams

The entire host runtime is already CDN-agnostic. It reads
`production` / `ssr` / `integrity` URL fields from `bos.config.json`
(FastKV) and fetches over plain HTTPS with SRI verification. No hostname
validation anywhere — any HTTPS URL works.

| Seam | Location |
|---|---|
| Config → runtime URL mapping (`production` → `url`/`entry`/`integrity`) | `packages/everything-dev/src/config.ts:679-840` (apps), `:1083-1121` (plugins; `bos://` rejected for production — CDN URLs required) |
| Deploy capture protocol (`[BOS_DEPLOY] url=… urlField=… integrity=…`) | `packages/everything-dev/src/integrity.ts:239-268` (`reportDeployResult` — prints marker + writes bos.config.json), `:270-287` (`parseDeployLines`), `:289-305` (`applyDeployResults`) |
| SRI computation | `integrity.ts:14` (`computeSriHash` — from bytes), `:71` (`computeSriHashForUrl`) |
| SSR remote load + SRI check | `host/src/services/federation.server.ts` (entry `<ssrUrl>/remoteEntry.server.js`, cache-busted `?v=<ssrIntegrity>`) |
| API/auth/plugin remote load + SRI in MF fetch pipeline | `host/src/services/plugins.ts:418-479`, `packages/everything-dev/src/mf.ts:40-79` (`installIntegrityFetchHook`) |
| Per-request tenant overrides + integrity | `host/src/services/tenant-runtime.ts:313-409` |
| Background re-verification | `host/src/services/integrity-monitor.ts` |
| FastKV publish + Railway redeploy | `packages/everything-dev/src/publish.ts:119-301`, `.github/workflows/deploy.yml` |

**The entire Zephyr-specific surface** (everything that must change):

| Concern | Location |
|---|---|
| `withZephyr()` build-plugin blocks | `host/rsbuild.config.ts:8,166-185`; `ui/rsbuild.config.ts:19,116-134` (client) and `:227-247` (ssr); `api/rspack.config.js:18,55-70`; `plugins/_template/rspack.config.js:10,33-51`; same pattern in `plugins/{apps,proposals,votes,auth}/rspack.config.js` |
| Zephyr error-code retry classification | `packages/everything-dev/src/build.ts:146-159` (`ZE\d{4,}`, "Zephyr upload failed"), `:257-262` |
| Zephyr output-URL regex | `packages/everything-dev/src/publish.ts:29-35` (`extractPublishedUrl` — `🚀 … Deployed:`) |
| CI secrets | `.github/workflows/deploy.yml:32-62` (+ `staging.yml`, `.github/templates/workflows/`) — `ZE_SECRET_TOKEN`/`ZE_CI_TOKEN`/`ZE_USER_EMAIL` |
| Catalog deps | root `package.json` — `zephyr-rspack-plugin`, `zephyr-rsbuild-plugin` |

Note: `app.host.production` (host bundle URL) is only a `bos start`
fallback record — the Railway host runs from the Docker image, not from
the CDN. Railway redeploy is what ships a new host.

## Design decisions

- **R2 bucket + custom domain** over Workers static assets / Pages.
  One bucket, path-based URLs, S3-style uploads, cheapest (10GB free,
  zero egress), and directory-style URLs are compatible with the existing
  MF `assetPrefix: "auto"` setup. Workers `StaticSite` would mean one
  Worker per workspace; Alchemy's Pages support is thinner than R2.
- **CDN-only for the api module** — api/ui/plugins still execute
  in-process inside the Railway host. No Cloudflare Workers rewrite
  (pg Pool, node MF runtime, Better Auth all stay as-is).
- **Hostname defaults to `cdn.<bos.config.json domain>`** — the zone must
  exist in the same Cloudflare account as the bucket. The host is already
  orange-clouded behind Cloudflare, so the zone exists; Alchemy adopts
  existing zones. Same-zone serving also eliminates the historical
  host-to-Zephyr cross-provider proxy failures entirely.
- **SRI computed from local `remoteEntry.js` bytes** (`computeSriHash`)
  — no post-upload fetch; the host verifies integrity at boot anyway.
- **Zephyr stays the default provider** — opt-in via
  `[deploy] cdn = "cloudflare"`. Mixed providers are fine: each remote's
  URL is independent (the `auth` plugin stays on Zephyr until the
  NEARBuilders repo adopts the uploader).
- **Per-object cache-control** — content-hashed chunks:
  `public, max-age=31536000, immutable`; `remoteEntry.js`,
  `remoteEntry.server.js`, `mf-manifest.json`: short `max-age` so deploys
  propagate (the historical stale-header class of bugs).
- **Uploads as Alchemy Actions keyed on a dist content hash** — re-run
  only when content changes. Immutable chunks accumulate; an optional
  lifecycle rule (Age ~90d) sweeps orphans. Negligible cost at this scale.

## Phase 0: Correct the record + `[deploy]` config schema (DONE)

**Status (2026-09-03)**: implemented — `DeployConfigSchema` +
`CloudflareCdnConfigSchema` in `types.ts` (on `BosConfigInput`,
`BosConfigInputSchema`, `BosConfigSchema`), `"deploy"` in
`BOS_CONFIG_ORDER` (`merge.ts`), `resolveDeployConfig()` in `config.ts`
(defaults: `cdn` → `"zephyr"`, `hostname` → `cdn.<domain>`, `bucket` →
`<account>-<domain>-cdn` slug, legacy `ci.railway.service` mapping;
throws when `cloudflare` is selected without a derivable hostname).
Tests: `packages/everything-dev/tests/unit/deploy-config.test.ts`.

**Verified implementation status of toml-infra-alchemy.md (2026-09-03)**:

| Phase | Claimed | Actual |
|---|---|---|
| 1 TOML format | DONE | **NOT implemented** — no `bos.config.toml` support, no `smol-toml`, no `config-source.ts` anywhere in the repo |
| 2 per-plugin schemas | DONE | DONE — verified (`api/src/db/index.ts:61,106`, `api/src/db/layer.ts:14-19`, `api/tests/unit/schema-isolation.test.ts`) |
| 3 `[infra]`/`[deploy]` | DONE | **NOT implemented** — no `InfraConfigSchema`/`DeployConfigSchema`; `BOS_CONFIG_ORDER` (`merge.ts:4-16`) lacks `infra`/`deploy` |
| 4 Alchemy backend | PARTIAL | **NOT implemented** — no `alchemy.ts`, no alchemy dependency, no DriverLive/MigrationLive split, no Neon pool |

This plan needs only the `[deploy]` section, which works in
`bos.config.json` today — TOML support (Phase 1 of the original plan) is
not a prerequisite.

Build:

| File | Change |
|---|---|
| `packages/everything-dev/src/types.ts` | `DeployConfigSchema`: `{ provider?: "railway", cdn?: "zephyr" \| "cloudflare", cloudflare?: { hostname?, bucket?, zone? } }` on `BosConfigInput` + `BosConfigSchema` |
| `packages/everything-dev/src/merge.ts` | Add `"deploy"` to `BOS_CONFIG_ORDER` (before `"app"`) for stable serialization; map legacy `ci.railway` → `deploy` during extends resolution |
| `packages/everything-dev/src/config.ts` | Parse + validate `[deploy]`; resolve defaults: `cdn` → `"zephyr"`, `hostname` → `cdn.<domain>`, `bucket` → `<account>-<gateway>-cdn` slug |

Secrets are always environment variables, never config:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Example committed config:

```json
{
  "deploy": {
    "provider": "railway",
    "cdn": "cloudflare",
    "cloudflare": {
      "hostname": "cdn.citynode.app",
      "bucket": "citynode-cdn"
    }
  }
}
```

## Phase 1: Provider gate in build tooling (DONE)

**Status (2026-09-03)**: implemented. `resolveCdnProvider()` +
`checkCdnProviderDeployable()` in `build.ts`; `BOS_CDN_PROVIDER` injected
into build subprocess env; `withZephyr` gated behind
`useZephyr = shouldDeploy && BOS_CDN_PROVIDER !== "cloudflare"` in all 8
build configs; early fail-fast guard in `publishToFastKv` (before NEAR
signing) and in `buildWorkspaceTargets` — a `cloudflare` config errors
clearly until Phase 2 lands. Tests:
`packages/everything-dev/tests/unit/build-cdn-provider.test.ts`.
Verified: `BOS_CDN_PROVIDER=cloudflare` eval of `api/rspack.config.js`
skips the Zephyr wrap; zephyr/unset unchanged.

**Deviations from the original phase text**: the ZE retry classification
(`build.ts` ZE-code regex / `Zephyr upload failed` backoff) stays
untouched — it is inert when `withZephyr` is skipped, so rewiring it now
would be dead code; it moves behind the provider strategy in Phase 2
when the cloudflare upload path exists. The `onDeployComplete`
SRI/report logic also stays in the zephyr hooks until Phase 2's uploader
replaces it. Sync ownership verified: `ui/rsbuild.config.ts` +
`api/rspack.config.js` in `FRAMEWORK_OWNED_SYNC_FILES`,
`plugins/*/rspack.config.js` via regex (`cli/sync.ts:76`); `host/` is
parent-only and not synced to child repos.

Original phase design:

- `build.ts`: resolve the deploy config before spawning builds; export
  `BOS_CDN_PROVIDER=<cdn>` into build subprocess env (alongside the
  existing `DEPLOY=true`).
- All ~9 rspack/rsbuild configs: `withZephyr()` is added only when
  `DEPLOY === "true" && process.env.BOS_CDN_PROVIDER !== "cloudflare"`.
  Mechanical edit; the `onDeployComplete` SRI/report logic moves to the
  cloudflare path (Phase 2).
- `build.ts:146-159, 257-262`: ZE-code/"Zephyr upload failed" retry
  classification moves behind the zephyr strategy; the cloudflare
  strategy classifies upload HTTP failures as retryable instead.
- `publish.ts:29-35` `extractPublishedUrl`: the `🚀 … Deployed:` regex
  stays for zephyr; the cloudflare path reads structured outputs instead
  (Phase 2).

Effort: ~150 lines, mechanical, zero behavior change for zephyr deploys.

## Phase 2: Alchemy deploy pipeline (the core) (DONE)

**Status (2026-09-03)**: implemented — `packages/everything-dev/src/cdn.ts`
(exported as `everything-dev/cdn`, built into dist via tsdown) +
`publishToFastKv` integration. Flow: resolve `resolveDeployConfig(bosConfig,
{ domain: gateway })` (staging-aware) → `ensureAlchemySandbox()` early →
log the Cloudflare notice → **fail fast before signing/building when no
Alchemy credentials are detected** (error points at `bos cdn login`) →
builds (no Zephyr via the Phase 1 env gate; classify expects no deploy URLs
for cloudflare) → generate
`.bos/alchemy/alchemy.run.ts` → spawn `bun <sandbox>/node_modules/alchemy/bin/cli.js
deploy alchemy.run.ts --stage <env> --yes` (stdin inherited so the one-time
state-store bootstrap prompt works locally) → compute SRI locally from
`dist/remoteEntry.js` (+ `remoteEntry.server.js` for ui) →
`applyCloudflareDeployEntries` writes `https://<hostname>/<prefix>` URLs into
`bos.config.json` → FastKV publish + Railway redeploy unchanged.
**`bos cdn login`** — first-class CLI command (`contract.ts` `cdnLogin`
route): ensures the sandbox and runs the alchemy OAuth flow, so no one
needs to remember the sandbox CLI path (plain `bunx alchemy@… login`
crashes — bunx does not install alchemy's `@effect/platform-*` peers).
Tests: `tests/unit/cdn.test.ts` (15). Verified: sandbox install resolves
`effect@4.0.0-rc.112` and the generated stack file imports cleanly against
alchemy + `everything-dev/cdn`.

**Deviations from the original phase design**:

- **Sandboxed Alchemy instead of a direct dependency** — alchemy 2.x peers
  on `effect >= 4` (peer-only, nothing bundled) while this repo pins effect
  3.21.2; a direct dep resolves alchemy's `import "effect"` against 3.21 and
  breaks at import time. `ensureAlchemySandbox()` installs a pinned
  `alchemy@2.0.0-beta.76` + `@effect/platform(-bun|-node)@^4.0.0-rc.112`
  into `.bos/alchemy/` (gitignored) where bun resolves the correct Effect.
  Collapsing the sandbox into a direct dependency is deferred to the Effect 4
  migration: `.scratch/cloudflare-cdn/issues/01-effect-4-migration-and-alchemy-desandbox.md`.
- **No separate Zone resource** — the R2 Bucket `domains` field infers the
  zone from the hostname (verified in alchemy's Bucket source); zone can be
  passed explicitly via `deploy.cloudflare.zone`.
- **Uploads use `Cloudflare.R2.ReadWriteBucketLocal`** (the Local binding
  layer — Cloudflare HTTP API with the deploy credentials) rather than the
  S3 API — no separate R2 S3 keys needed.
- **No output parsing** — URLs are deterministic (`https://<hostname>/<key>`),
  SRI comes from local dist files; alchemy outputs are not read.
- **No cloudflare retry classification in build.ts** — uploads moved out of
  build stdout into the publish-orchestrated alchemy step, so the
  "No deploy URL" classification simply doesn't apply (builds pass
  `expectDeployUrl = false`); a single alchemy attempt with clear error
  output replaces retry backoff.
- **State store decided**: the generated stack uses `Cloudflare.state()`
  (resolves the Phase 3 open item; first local run bootstraps the
  state-store worker interactively, CI resolves via `CI=true`).

Original phase design (superseded in the details above):

New `packages/everything-dev/src/cli/alchemy.ts`:
`generateAlchemyRun(deployConfig, workspaces)` emits `.bos/alchemy.run.ts`
(gitignored) declaring:

```typescript
export default Alchemy.Stack(
  "Cdn",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const zone = yield* Cloudflare.Zone.Zone("Zone", { name: domain });
    const bucket = yield* Cloudflare.R2.Bucket("Cdn", {
      name: bucketName,
      domains: [{ name: `cdn.${domain}`, zone }],
      cors: [
        { allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"] },
      ],
    });
    for (const workspace of workspaces) {
      yield* Alchemy.Action(`Upload/${workspace.name}`, {
        inputs: { hash: workspace.distHash },
        run: uploadDist(bucket, workspace),
      });
    }
    return { cdnBaseUrl: `https://cdn.${domain}` };
  }),
);
```

Upload semantics (inside each Action):

- Walk `<workspace>/dist/**`, put every object under `<workspace>/`
  prefix via the S3-compatible API.
- Set `contentType` per file extension (`application/javascript` for
  `.js`/`.mjs`, etc.) — R2 serves it verbatim on the custom domain and
  MF loading requires correct MIME.
- Cache-control per file class: hashed chunks immutable 1y; entry files
  (`remoteEntry.js`, `remoteEntry.server.js`, `mf-manifest.json`,
  `plugin.manifest.json`) short max-age.
- Entry files are overwritten per deploy; hashed chunks are immutable.

`publish.ts` integration — when `cdn === "cloudflare"`, after
`buildWorkspaceTargets`:

1. Write `.bos/alchemy.run.ts`, spawn `alchemy deploy` (non-interactive).
2. Read the stack outputs (cdn base URL).
3. Compute SRI per workspace from local
   `<workspace>/dist/remoteEntry.js` via `computeSriHash` (the ssr
   variant from `remoteEntry.server.js`).
4. `applyDeployResults` with `https://cdn.<domain>/<workspace>/` —
   same dotted fields as today (`app.ui.production`,
   `plugins.<key>.production`, …).
5. FastKV publish and `railway redeploy` — unchanged.

Dependency: `alchemy` (+ `alchemy/Cloudflare`) in
`packages/everything-dev/package.json`. Alchemy v2 is Effect-native —
`generateAlchemyRun` can be an Effect program sharing the repo's error
types.

Effort: ~300 lines (generator + publish hook + uploader Action).

## Phase 3: CI wiring

- `.github/workflows/deploy.yml` + `staging.yml` +
  `.github/templates/workflows/`: add `CLOUDFLARE_API_TOKEN` (scoped:
  R2 edit + zone DNS edit) and `CLOUDFLARE_ACCOUNT_ID` secrets; keep
  `ZE_*` secrets while the zephyr fallback exists.
- **Alchemy state in CI** (open item): recommended — bootstrap the
  Cloudflare state-store worker once (`alchemy cloudflare` commands) so
  resource state persists across CI runners, per Alchemy's CI guide.
  Alternative: committed local state in `.alchemy/`. Decide during
  implementation; the generated run file uses `Cloudflare.state()`.

## Phase 4: Cutover + verification

1. **Local-first cutover** (chosen 2026-09-03 — staging gateway skipped):
   set `"deploy": { "cdn": "cloudflare" }` in `bos.config.json`, then from
   a local machine:
   - `bos cdn login` — installs the `.bos/alchemy` sandbox and runs the
     alchemy OAuth flow (interactive; the CLI forwards stdin so the
     one-time state-store bootstrap prompt during the first deploy also
     works)
   - `bos publish --deploy` — fails fast before signing/building if no
     credentials are detected; otherwise deploys all workspaces
     (host, ui, api, auth + plugins — a `--packages`-less run selects
     everything including the local auth plugin and `_template`)
   - Verify with `curl -I https://cdn.<domain>/ui/remoteEntry.js`
     (MIME, cache-control tiers, CORS), then host boot SRI, SSR remote
     load, tenant overrides, integrity monitor, MCP / Scalar endpoints
   - Optional staging run remains available via `--env staging`
2. **Production publish** — `applyCloudflareDeployEntries` rewrites all
   Zephyr URLs in `bos.config.json`; FastKV publish makes them live.
   Note: once the `deploy` section is committed, the CI deploy workflow
   needs the Phase 3 Cloudflare secrets or it fails at the credentials
   fail-fast.
3. **Docs**: update `AGENTS.md` deploy section,
   `.github/workflows/README.md`, this plan's status; changeset.
4. **Rollback**: set `"cdn": "zephyr"`, re-run `bos publish --deploy`
   (Zephyr re-uploads and rewrites URLs).

## Risks / notes

- **`auth` is local and covered** — `app.auth` declares
  `local:plugins/auth` in this repo, so local `bos publish --deploy`
  uploads it and rewrites `app.auth.production` like any other
  workspace. (The CI `--packages` lists exclude auth/host/template —
  relevant only when wiring Phase 3 CI.)
- **Zone prerequisite** — `cdn.<domain>` custom domain requires the
  `<domain>` zone in the same Cloudflare account as the R2 bucket.
  Confirm account access before cutover.
- **MIME types** — the uploader must set `contentType`; R2 custom domains
  serve object metadata verbatim.
- **CORS** — browser-side remote loads (page on `<domain>`, remotes on
  `cdn.<domain>`) need the bucket CORS rule; GET/HEAD `*` matches the
  current dev-server behavior (`ui/rsbuild.config.ts:162-166`).
- **`r2.dev` public URL is not for production** (rate-limited) — always
  the custom domain.
- **SRI size cap** — `integrity.ts:7` caps hashed responses at 20MB;
  fine for `remoteEntry.js` files.
- **Object accumulation** — optional lifecycle rule sweeps stale hashed
  chunks; skipped initially (storage is negligible).

## Implementation order

```
Phase 0 (config schema + record fix)  ->  DONE — DeployConfigSchema, BOS_CONFIG_ORDER,
   |                                    resolveDeployConfig, deploy-config.test.ts
Phase 1 (provider gate)               ->  DONE — resolveCdnProvider + BOS_CDN_PROVIDER env,
   |                                    useZephyr gate in 8 configs (guard removed in Phase 2)
Phase 2 (alchemy pipeline)            ->  DONE — everything-dev/cdn module, .bos/alchemy sandbox,
   |                                    alchemy.run.ts generator, publish.ts orchestration,
   |                                    local SRI + applyDeployEntries, cdn.test.ts
Phase 3 (CI wiring)                   ->  secrets + state store (state store already decided)
   |
Phase 4 (cutover)                     ->  staging -> prod -> docs
```

Each phase is independently shippable; zephyr behavior is unchanged until
a config opts into `"cdn": "cloudflare"`.

## Cost

```
R2 storage (all MF bundles)        $0/mo   (free tier: 10GB, zero egress)
Cloudflare custom domain           $0/mo
Alchemy                            $0/mo   (OSS)
Railway host                       $5/mo   (unchanged)
Zephyr fallback                    $0/mo   (free tier, kept as fallback)
```

Cost is unchanged — the win is operational: no cross-provider proxy
failures, scoped Cloudflare tokens instead of Zephyr CI tokens, and a
pluggable fallback provider.

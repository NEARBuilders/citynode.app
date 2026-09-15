# Plan 018: Migrate the five existing workspaces onto the db/auth facades

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Design doc**: [plans/v1-current/every-plugin-db-auth-absorption.md](../plans/v1-current/every-plugin-db-auth-absorption.md)
> (decision D1 covers the slug semantics and the dead `api` special case).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 017
- **Category**: tech-debt / product direction (ticket #89)
- **Planned at**: 2026-09-15, post #89 spike

## Why this matters

After 017 the facades exist but five workspaces still carry the copies (and the drift:
proposals/votes' dead `pluginId === "api"` special case, auth's diverged layer, apps'
stale lib). This plan deletes the copies without changing runtime behavior — same
slugs, same journal tables, same URLs — while picking up the shared SAVEPOINT-fixed
runner (subsumes plan 008's per-workspace fixes, including the proposals/votes 25P02
aborted-transaction bug).

## Current state (verified at spike time)

- `api/src/db/layer.ts` (91 lines) — always `plugin_${pluginMigrationSlug(pluginId)}`.
- `plugins/{proposals,votes}/src/db/layer.ts` (87 lines each, byte-identical) — carry
  the dead `api` special case; `throw new DatabaseError` instead of `Effect.fail`.
- `plugins/auth/src/db/layer.ts` (84 lines) — schema-less (own auth DB, `public`).
- `plugins/apps` — no db; stale `lib/{auth,context}.ts` copies.
- `lib/context.ts` local copies in `_template`/proposals/votes/apps (api already
  re-exports from `every-plugin`); `lib/auth.ts` converged in api/proposals/votes,
  stale in `_template`/apps.

## Steps (per workspace, in this order)

1. **api** — `db/layer.ts` + `db/index.ts` + `db/migrate.ts` → `DatabaseLive` from
   `every-plugin/db`; `lib/auth.ts` → thin typed re-export from `every-plugin/auth`.
   Keep the disk-loaded `migrations/` directory; pass it to `DatabaseLive`'s
   `migrations` option.
2. **proposals, votes** — same as api, **deleting the dead `api` special case** (their
   schemaName is already always `plugin_<slug>`; no data migration). Their
   disk-loaded runner copies disappear, which delivers the 25P02 fix via the shared
   runner. Delete proposals' diverged `runEffect` in `src/index.ts:23-33` (plan 002's
   leftover) in favor of the facade bridge.
3. **auth** — `DatabaseLive(url, { pluginId, schemaIsolation: false })`; delete
   `db/layer.ts`/`db/index.ts`/`db/migrate.ts`.
4. **apps** — replace `lib/{auth,context}.ts` with re-exports (auth from
   `every-plugin/auth`, context already covered by the `every-plugin` bridge).
5. Each workspace keeps its `drizzle.config.ts` (CLI identity — unchanged) and its
   `rspack.config.js` externals.

## Verification (after each workspace, then all)

- `bun typecheck` and `bun lint` (root).
- Workspace suites: `bun run --cwd api test`, `bun run --cwd plugins/proposals test`,
  `bun run --cwd plugins/votes test`, `bun run --cwd plugins/apps test`.
- **No-migration proof**: `docker compose up -d --wait`, then against the dev
  databases compare `SELECT schema_name FROM information_schema.schemata WHERE
  schema_name LIKE 'plugin_%'` and `SELECT * FROM drizzle.__drizzle_migrations`
  before/after booting the stack — identical sets.
- `bun run --cwd host test` (2 `runtime-remote` failures are known deploy-gated).
- Boot `bun run dev` with the test databases and confirm each plugin's routes answer.

## STOP conditions

- Any pre/post schema or journal diff in the no-migration proof — the slug decision
  (D1) is wrong for that workspace; stop and re-derive before touching data.
- A workspace's migrations rely on behavior the shared runner dropped (e.g. auth's
  no-tolerance semantics) — port the behavior as a `runMigrations` option rather than
  re-forking the runner.

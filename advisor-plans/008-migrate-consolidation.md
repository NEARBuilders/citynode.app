# Plan 008: Consolidate `db/migrate.ts` into `everything-dev/db` and fix the aborted-transaction regression

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c9ca44e1..HEAD -- api/src/db/migrate.ts plugins/auth/src/db/migrate.ts plugins/proposals/src/db/migrate.ts plugins/votes/src/db/migrate.ts packages/everything-dev/src/db`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but land after plans 001/002 to avoid churn in adjacent plugin files)
- **Category**: bug / tech-debt
- **Planned at**: commit `c9ca44e1`, 2026-09-15

## Why this matters

The database migration runner is copy-pasted into **four** workspaces (~380-450 lines each) and has drifted three ways. Most seriously: `plugins/proposals` and `plugins/votes` "tolerate" duplicate DDL objects by catching the error and `continue`ing **without rolling back to a savepoint** — but in PostgreSQL an errored statement aborts the whole transaction, so the journal insert and every later statement fail with 25P02 exactly in the partial-overlap case the code thinks it's handling. `api` fixed this with SAVEPOINT/ROLLBACK; the fix never propagated. `plugins/auth` has no duplicate tolerance at all. Every future migration fix must be hand-applied four times — it has already failed to propagate once.

## Current state

Four copies (all verified by diff):
- `api/src/db/migrate.ts` (~419 lines) — **newest**: SAVEPOINT-based duplicate tolerance with 3 SQLSTATE codes (`api:25,273-290`), `schemaName` preflight, `Effect.map((value) => ({ ok: true as const, value }))` + `Effect.catch` tagged-result blocks (8× across the four files at api:110,135 / auth:94,119 / proposals:151,176 / votes:151,176).
- `plugins/proposals/src/db/migrate.ts` and `plugins/votes/src/db/migrate.ts` (~447 lines, byte-identical to each other) — check only `"42710"` (`proposals:28`), bare `continue` at `proposals:312` (no savepoint), plus `adoptPublicTables` (ALTER TABLE ... SET SCHEMA, `proposals:86,256`) which api lacks.
- `plugins/auth/src/db/migrate.ts` (~378 lines) — oldest; throws on any statement error (`auth:246-258`); no tolerance.

The proposals/votes bug (excerpt, `plugins/proposals/src/db/migrate.ts:302-316`):

```ts
yield* Effect.tryPromise({
  try: () =>
    db.transaction(async (tx) => {
      for (const [i, statement] of migration.sql.entries()) {
        try {
          const stmt = schemaName ? statement.replace(/"public"\./g, "") : statement;
          await tx.execute(sql.raw(stmt));
        } catch (cause) {
          if (isDuplicateObjectError(cause)) continue;   // <-- tx is now aborted; every later stmt fails 25P2
          throw new DatabaseError({ ... });
```

api's fix (excerpt, `api/src/db/migrate.ts:273-290`):

```ts
await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
try {
  await tx.execute(sql.raw(stmt));
  await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
} catch (cause) {
  await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
  // ... duplicate-codes check, then continue
}
```

- Shared helpers already live in `packages/everything-dev/src/db/` — `extractExpectedTables`, `getMigrationStorage`, `toSqlArray` etc. (imported by the copies themselves, e.g. `api/src/db/layer.ts:3` imports `pluginMigrationSlug`); only the 400-line runner logic didn't move.
- Effect 4 note: `Effect.either` is gone; the hand-rolled `{ok: true as const}` unions were the migration shim. `Effect.exit` + `Exit.match` (verified available in `4.0.0-rc.112`) is the cleaner replacement.
- DB layer per workspace: pglite locally / postgres in prod, chosen in each `db/layer.ts` via the connection-string prefix (`pglite:`). The runner takes a drizzle-like `db` handle — the shared module must keep that interface.
- Test infra: docker test DBs via `bun run test:db:up` (`postgres-api-test` :5434 `api_test_db`, `postgres-auth-test` :5435 `auth_test_db`); `.env.test` maps the URLs. Plugin suites default to in-memory pglite.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|
| Start test DBs | `bun run test:db:up` | healthy |
| Typecheck (all) | `bun typecheck` | exit 0 |
| Lint | `bun lint` | exit 0 |
| api tests | `cd api && bun run test tests/unit/` | 66 pass |
| votes / proposals / auth | `cd plugins/votes && bun run test` etc. | 1 / 10 / 174 pass |
| everything-dev tests + dist | `cd packages/everything-dev && bun run test && bun run build` | 420 pass (2 skipped); build success |

## Scope

**In scope**:
- `packages/everything-dev/src/db/migrate.ts` (create; the shared runner)
- `packages/everything-dev/src/db/index.ts` (export it)
- `api/src/db/migrate.ts`, `plugins/{auth,proposals,votes}/src/db/migrate.ts` (reduce to thin adapters or re-exports)
- New characterization/regression tests under `packages/everything-dev/tests/` and/or the affected plugins' suites

**Out of scope**:
- `plugins/_template` — it has no `db/migrate.ts` (check: if it does, treat as in-scope identically).
- `db/layer.ts` files (schema-name/slug logic) — three different slug normalizers exist, but consolidating the *layer* is the every-plugin/db spike (ticket 01), not this plan.
- Migration SQL files, journal schema, `getMigrationStorage` semantics.
- The `plugins/apps` plugin (no db/migrate.ts — verify with `ls plugins/apps/src/db/`).

## Git workflow

- Branch: `improve/008-migrate-consolidation`.
- Commit style: `feat(everything-dev)!: shared migrate runner fixes savepoint regression (b?)` + changeset.
- Do NOT push unless instructed.

## Steps

### Step 1: Characterize current behavior per workspace (before touching anything)

Write a characterization test per distinct behavior, using in-memory pglite (model after how plugin suites set up pglite — check `plugins/_template/src/db/layer.ts` for the pglite connection pattern):
1. **Fresh schema**: full migration applies cleanly (all four workspaces today).
2. **Partial overlap (the bug)**: pre-create one object the migration also creates (e.g. a table from statement 3 of 10), then run. Expected AFTER the fix: migration completes, skipping the duplicate. CURRENT reality for proposals/votes: it fails (aborted tx) — write this test first against `api`'s runner (passes) and against proposals' runner (fails), and record both results in your report; the failing variant becomes the regression test for the shared runner.
3. **adoptPublicTables**: proposals' path moves public tables into the plugin schema when adopting — characterize with a pglite test if feasible; if `adoptPublicTables` can't be exercised without postgres, gate that characterization behind `TEST_DATABASE=postgres` (api's tests already support this env opt-in).

**Verify**: characterization tests exist and the api-vs-proposals divergence is demonstrated (one passes, one fails on case 2).

### Step 2: Hoist the runner into `everything-dev/db`

Create `packages/everything-dev/src/db/migrate.ts` with a single runner taking **api's version as the base** (savepoint tolerance, 3 SQLSTATE codes) plus an options object reconciling the deltas:

```ts
export interface MigrateOptions {
  schemaName?: string;                      // plugin_<slug> scoping (all copies do this)
  adoptPublicTables?: boolean;              // proposals/votes behavior
  duplicateSqlStates?: string[];            // default: api's 3 codes
}
export const migrate = (db: DatabaseHandle, migrations: Migration[], storage: MigrationStorage, opts: MigrateOptions) => ...
```

Replace the hand-rolled `{ok: true as const}` unions with `Effect.exit(...)` + `Exit.match(...)` throughout. Preserve each workspace's public function signatures so call sites (each `db/layer.ts` / plugin index) don't change behavior — the four `db/migrate.ts` files become thin wrappers that pass their options (auth: default tolerance now ON — see STOP conditions).

**Verify**: `cd packages/everything-dev && bun run test && bun run build` → green; `bun typecheck` → exit 0.

### Step 3: Swap the four workspaces onto the shared runner

One workspace at a time, in this order: **api → votes → proposals → auth** (newest to oldest, so each swap is a smaller diff). After each swap, run that workspace's suite. The partial-overlap regression test from Step 1 must pass against the shared runner for every workspace.

**Verify**: after each swap — that workspace's tests pass; after all four — `bun typecheck && bun lint` → exit 0; api 66, votes 1, proposals 10, auth 174.

### Step 4: Postgres-backed verification

With `bun run test:db:up`, run the affected suites against real postgres (`TEST_DATABASE=postgres` where supported) at least once for the savepoint path — pglite and postgres differ in transaction-abort semantics; the 25P2 regression only reproduces faithfully on postgres. If a postgres-mode harness doesn't exist for plugins, run the api suite's postgres mode and a one-off script (in a scratch file, not committed) executing the partial-overlap scenario through the shared runner against `api_test_db`.

**Verify**: partial-overlap scenario completes against postgres; report the observed SQLSTATE handling.

## Test plan

- Characterization tests (Step 1) kept as the regression suite for the shared runner: fresh schema, partial overlap (the 25P2 fix), duplicate-code skip, journal write after skip.
- Per-workspace suites stay green — they boot real migrations through each plugin's layer.
- The `adoptPublicTables` characterization test carries a comment-free marker in its title (`adoptPublicTables`) and is postgres-gated if needed.

## Done criteria

- [ ] `wc -l` on the four `db/migrate.ts` files shows thin wrappers (< ~40 lines each) or the files are re-exports
- [ ] Partial-overlap regression test passes on the shared runner (pglite and, if feasible, postgres)
- [ ] `grep -rn "ok: true as const" api/src plugins/*/src packages/everything-dev/src/db` → no matches in migration code
- [ ] `bun typecheck`, `bun lint`, and all four workspace suites pass
- [ ] Changeset added (everything-dev: minor — new shared API; api/plugins: patch — behavior fix for proposals/votes)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

- The partial-overlap characterization does NOT fail against proposals' current runner (the 25P2 reasoning was wrong — then the consolidation is still worthwhile but re-scope the "bug fix" claim and report).
- `adoptPublicTables` semantics can't be expressed as an option without a behavioral decision (e.g. it must run BEFORE vs AFTER savepoint setup) — report the decision needed; do not guess.
- Auth's lack of tolerance turns out to be deliberate (e.g. auth schema must never partially overlap) — then auth's wrapper gets `duplicateSqlStates: []` and the plan proceeds; only stop if a test proves tolerance breaks auth.
- pglite cannot reproduce savepoint/abort semantics at all (Step 1 case 2 passes everywhere on pglite) — then the regression test must be postgres-gated; if neither driver reproduces it, STOP and report.

## Maintenance notes

- The `plugins/_template` scaffold should adopt the shared runner when its db layer is next touched (full story is ticket 01, every-plugin/db).
- Reviewer: scrutinize the savepoint naming (must be unique per statement index within a transaction) and that the journal insert happens INSIDE the same transaction as the statements.
- Future migration fixes land in exactly one file now; the three-delta reconciliation (tolerance codes, adoption, preflight) is explicit in `MigrateOptions`.

# Plan 019: Sync, scaffold, and public-type cutover for the absorbed facades

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Design doc**: [plans/v1-current/every-plugin-db-auth-absorption.md](../plans/v1-current/every-plugin-db-auth-absorption.md)
> (decision D4 covers sync ownership).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches `bos sync`, which rewrites user source)
- **Depends on**: 017, 018
- **Category**: product direction (ticket #89)
- **Planned at**: 2026-09-15, post #89 spike

## Why this matters

017/018 shrink this repo's plugin surface; children still carry the old copies until
`bos sync` delivers the shrinkage, and the framework's public plugin type still
mentions `PluginIdTag`. This plan closes both loops.

## Steps

1. **Sync file-list shrink** (`packages/everything-dev/src/cli/sync.ts`):
   - Per-plugin derived list: drop `src/db/{index,layer,migrate}.ts` and
     `src/lib/context.ts`; keep `rspack.config.js`, `drizzle.config.ts`,
     `tsconfig*.json`, `tests/types.d.ts`, `src/global.d.ts`; `src/lib/auth.ts`
     becomes the thin re-export template.
   - Sync must treat upstream-deleted framework-owned files as **removed** for
     children whose local hash matches the snapshot (unchanged deletion semantics —
     verify with a fixture child carrying an unmodified `db/layer.ts`).
   - A child with **local edits** to a now-deleted file keeps it (conflict path) and
     gets a warning naming the `every-plugin/db` migration path.
2. **Scaffold cutover**: `bos init`'s plugin scaffold (tarball path) emits the
   `_template` file list post-017 (contract + service + index + migrations) — no
   code change needed if `_template` is the source; verify the copied file list in
   `init.structure.test.ts` expectations.
3. **Drop the migration-window compatibility**:
   - Remove `Effect.provideService(PluginIdTag, …)` from
     `plugin-loader.service.ts` and the `| PluginIdTag` union from the accepted
     `initialize` type in `packages/every-plugin/src/plugin.ts` (public R narrows to
     `Scope.Scope` — the design doc's goal).
   - Remove the `everything-dev/db` → `every-plugin/db` re-exports from plan 017
     step 5 (major bump of `everything-dev`; note in its CHANGELOG that child repos
     must `bos sync` before upgrading).
4. **Docs**: update AGENTS.md ("Plugin Architecture" scoped-resources guidance now
   points at `every-plugin/db`'s `DatabaseLive` + `buildScoped`) and the
   plugin-development skills.

## Verification

- `packages/everything-dev` suites:
  `bun run --cwd packages/everything-dev test` — especially
  `sync.template.test.ts` (add a case: scaffold → sync → framework-owned
  `db/layer.ts` removed locally, `lib/auth.ts` becomes the re-export) and
  `init.structure.test.ts`.
- `bun typecheck`, `bun lint`, `bun run build` in `packages/everything-dev` and
  `packages/every-plugin`.
- Scratch a child repo via `bos init` from this parent, `bos sync` it, confirm the
  file shrink arrives without conflicts when the child is pristine.
- `bun run --cwd host test` (known deploy-gated `runtime-remote` exceptions aside).

## STOP conditions

- Sync would delete a locally-modified framework-owned file without a conflict —
  abort and fix the deletion semantics before shipping (this is user-source loss).
- Any published child repo in the wild still imports `everything-dev/db` slug helpers
  at runtime when 3 lands — extend the re-export window one more release instead of
  breaking it.

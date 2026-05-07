---
"everything-dev": patch
---

Fix typecheck failures in `bos init` output.

- Keep `sync:api-contract` as a standalone script (remove only from premature `typecheck` / `postinstall` chains).
- Strip deleted workspace references (`packages/everything-dev`, `host`) from the generated `typecheck` script.
- Prune missing `"files"` entries in `api/tsconfig.json` after template copy.
- Remove local `plugins/auth` import and `inferAdditionalFields` usage from copied `ui/src/lib/auth-client.ts`.
- Generate `api/src/auth-client.gen.ts` and `api/src/plugins-client.gen.ts` stubs so API compiles without local plugin types.
- Expand `.templatekeep` to include `api/tests/types.d.ts`, `ui/src/routes/_layout/apps/**`, and `ui/src/routes/_layout/_authenticated/organizations/**`.
- Update `init.structure.test.ts` assertions for newly included route files.

---
"everything-dev": minor
---

Fix `bos init` hanging during "Installing dependencies..." on minimal scaffolds (no template repository):

- Populate `workspaces.catalog` with resolved framework versions so `catalog:` deps can be resolved by Bun. Previously the catalog was empty, causing `bun install` to hang or fail silently.
- Call `personalizeConfig` in the minimal scaffold path so scripts, workspace refs, and gen-file stubs are created — matching the behavior of the full template path.
- Stream output from `bun install`, `bos types gen`, and `docker compose up` instead of piping to `/dev/null`, so install progress and errors are visible.
- Add timeouts to `execCommand` calls (5 min for bun/docker, 2 min default) so a hung command can't block the CLI forever.
- Add a 10s timeout to `fetchRemotePluginManifest` to match the existing `fetchJson` timeout pattern.
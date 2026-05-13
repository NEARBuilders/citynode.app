---
"everything-dev": minor
---

Add `bos init` support for extending any deployed app. The `--extends` flag now accepts `bos://account/gateway` or `account/gateway` shorthand to extend any published app. When the parent config has no `repository`, `bos init` walks the `extends` chain to find one, then falls back to a minimal scaffold inheriting the parent runtime config. Removed `--extends-account` and `--extends-gateway` in favor of the single `--extends` flag. Init now shows progress labels for each phase (fetching config, resolving source, copying files, installing deps, etc.) instead of a single stalled spinner. Outdated package warnings now only show for `everything-dev` and `every-plugin` (framework packages), not transitive deps like rspack or module-federation.

---
"everything-dev": minor
---

Add `bos init` support for extending any deployed app. The `--extends` flag now accepts `bos://account/gateway` or `account/gateway` to extend any published app, not just the default template. When the parent config has no `repository` field, `bos init` walks the `extends` chain to find one, then falls back to a minimal scaffold (just `bos.config.json`, `package.json`, `.env.example`, `.gitignore`) inheriting the parent's runtime config. Removed `--extends-account` and `--extends-gateway` in favor of the single `--extends` flag.
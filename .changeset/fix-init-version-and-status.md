---
"everything-dev": patch
---

Fix `init` pinning stale versions and `status` nagging on workspace references.

- `manifest-normalizer.ts`: Prefer the running CLI's own package version over the downloaded template source when resolving `everything-dev`/`every-plugin` versions during `bos init`. Generated projects now get the version of the CLI that created them (e.g. `^1.9.3` instead of a potentially newer/unavailable `^1.9.4`), preventing `bun install` failures when the template source is ahead of the cached CLI.
- `status.ts`: Skip `workspace:*`, `catalog:*`, and `file:` specifiers in `readInstalledVersion`. Prevents `bos status` / `warnIfOutdated` from treating local workspace references as outdated packages.

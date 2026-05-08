---
"everything-dev": patch
---

Fix false-positive outdated package warnings when installed and latest versions are identical.

- `status.ts`: Fix the regex in `readInstalledVersion` that strips semver prefixes. The negated character class `/^[^^~>=]+/` was accidentally leaving the `^` prefix intact, so `^1.9.5` was never stripped and always compared unequally to `1.9.5`.
- `cli.ts`: Introduce `normalizeVersion()` helper that strips `^`, `~`, `>=`, and `v` prefixes from both sides before comparing. Applied to `warnIfOutdated`, the `status` command display, and the `status` footer check to prevent all edge-case false positives.

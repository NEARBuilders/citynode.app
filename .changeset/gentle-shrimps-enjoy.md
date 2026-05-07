---
"everything-dev": patch
---

Fixed CLI log message during `bos init` to use `p.log.info` instead of `console.log`, preventing it from breaking the clack spinner output.

Prevented stale local `packages/every-plugin` copies in generated projects by ensuring `.templatekeep` excludes `packages/*`.

Added proactive outdated-package warning in CLI when running `dev`, `build`, or `start` commands. Warns users when `every-plugin` or `everything-dev` are behind the latest npm version and suggests running `bos upgrade`.

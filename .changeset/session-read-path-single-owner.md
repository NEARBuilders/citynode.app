---
"everything-dev": minor
"every-plugin": minor
"ui": patch
"@everything-dev/auth-plugin": patch
---

Fix the recurring post-sign-in redirect loop structurally: the session read path and auth redirect policy now have one owner (`everything-dev/ui/auth`), shared across the core ui and plugin ui remotes as a strict Module Federation singleton. A mixed deploy can no longer run two divergent session-read copies whose guard decisions disagree into "Too many redirects" — the login guard and the authenticated guard read through exactly one module, and a version mismatch fails loudly at load instead of silently loading a second copy. Child projects receive the consolidated guards via `bos sync` (`ui/src/lib/auth-guards.ts`, `ui/src/lib/plugin-path.ts`, and the plugin's drifted `session-cache.ts` copy exit sync ownership). See ADR 0013.

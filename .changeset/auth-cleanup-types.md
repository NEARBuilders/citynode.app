---
"@everything-dev/auth-plugin": patch
---

Clean up tracked generated types and old SQLite artifacts.

- Added `types/` to `.gitignore` to prevent generated `.d.ts` files from being tracked
- Removed previously tracked generated type declarations from git history
- Removed leftover `auth.db` and `test-auth-sandbox.db` SQLite files from pre-PostgreSQL migration
- No source code changes, no functional impact

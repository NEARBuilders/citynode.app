---
"@everything-dev/auth-plugin": patch
"@everything-dev/projects-plugin": minor
"api": minor
"ui": minor
---

Migrate projects and API plugins to PostgreSQL with pglite fallback, add generic upvote system with SSE live ranking, and redesign projects page as a real-time ranked leaderboard.

### What Changed

**API Plugin**
- Migrated from SQLite to PostgreSQL (`pg` production, `pglite` local fallback)
- Added `upvotes` table with unique constraint on `(thing_id, user_id)`
- New upvote endpoints: `upvoteThing`, `downvoteThing`, `getUpvoteCount`, `getUpvoteFeed`
- Real-time SSE stream at `/api/upvotes/stream` with in-memory pub/sub
- Unified database defaults to `pglite:.bos/<plugin>/:memory:`

**Projects Plugin**
- Migrated from SQLite/libsql to PostgreSQL (same driver pattern as auth)
- Dropped KV store (`kvStore` table, `KvService`, and all KV routes)
- Regenerated Drizzle schema with `pgTable` and `timestamp with time zone`
- Unified database defaults to `pglite:.bos/projects/:memory:`

**Auth Plugin**
- Updated default `AUTH_DATABASE_URL` to `pglite:.bos/auth/:memory:`
- Driver now detects `:memory:` basename for true in-memory mode

**UI**
- Complete redesign of projects list page
- Full-width horizontal cards with rank numbers (`#1`, `#2`, etc.)
- Vote stack on right (↑ count ↓)
- Projects sorted by upvote count descending
- Framer Motion `Reorder.Group` for smooth rank transitions
- SSE integration pushes live vote updates that trigger re-sorting
- Removed legacy `keys/` KV test routes and UI

**Config**
- Updated `.env.example` with new PostgreSQL default comments
- Removed `keys/**` from `bos.config.json` projects plugin routes

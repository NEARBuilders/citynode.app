---
"host": patch
"every-plugin": patch
---

Fixed SSR crash in `bos dev` with remote host and local UI without `--ssr` — the host no longer attempts SSR from the browser dev server (which doesn't serve `remoteEntry.server.js`). SSR is only attempted when an SSR URL is explicitly configured.

Fixed silent error suppression in the host API router interceptor — `formatORPCError` output is now properly `console.error`'d, matching the publicRpcRouters pattern.

Fixed `formatORPCError` box-drawing output to split messages on newlines and re-prefix each line with `│`, preventing misalignment when Drizzle's `Failed query` messages (which contain `\n`) are surfaced. The underlying PostgreSQL error is now visible in the error box.

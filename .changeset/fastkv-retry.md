---
"everything-dev": patch
---

Add retry with backoff to FastKV config fetches

`fetchJson` in `fastkv.ts` had a 10s timeout but no retry logic. A single transient network failure (DNS hiccup, TLS reset, packet loss) would propagate as a fatal error, killing `bos dev` and `bos sync` entirely. This was especially impactful for users in regions with intermittent connectivity to `kv.main.fastnear.com`.

- Retry up to 3 times on network errors and 5xx responses (1s → 2s → 4s backoff)
- Do not retry on 4xx (legitimate "not found" returns null as before)
- Log a warning when all attempts are exhausted

---
"api": minor
"host": minor
"everything-dev": minor
---

Platform CDN provider (`deploy.cdn: "platform"`) — `bos publish --deploy` uploads Module Federation bundles to the platform storage (`POST /api/storage/bundles`) authenticated by the CLI session, and the host serves them publicly from `/bundles/*` with immutable cache headers. No Zephyr or Cloudflare account needed. New `--cdn` flag overrides `deploy.cdn` in `bos.config.json` (default `zephyr`, opt-in).

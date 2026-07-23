---
"host": patch
---

Strip `etag`/`last-modified` and override `cache-control` on proxied static assets to prevent Cloudflare from serving stale headers via 304 revalidation. Sets `cache-control: public, max-age=14400, s-maxage=300` (no `stale-while-revalidate`) so the CDN always does a full GET after 5 min, guaranteeing fresh response headers.

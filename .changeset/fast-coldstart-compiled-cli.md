---
"everything-dev": patch
"host": patch
---

Remove host/api/ui/plugins source from Docker image (loaded remotely at runtime). Remove deprecated `GATEWAY_DOMAIN` environment variable in favor of consistent `BOS_GATEWAY`.

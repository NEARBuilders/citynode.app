---
"everything-dev": minor
---

Add environment variable support to `bos start` for containerized deployments

The `start` command now reads `BOS_ACCOUNT` and `BOS_GATEWAY` from `process.env` when CLI flags are not provided, enabling config-less Docker containers that fetch runtime configuration directly from the NEAR FastKV registry.

Also removed `bos.config.json` from the Dockerfile so the image no longer bakes in local configuration.

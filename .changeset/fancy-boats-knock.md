---
"everything-dev": minor
"ui": minor
"host": minor
---

Add `title` and `description` fields to `bos.config.json`, runtime config, and `ClientRuntimeInfo`. SEO head metadata now reads `title`/`description` from `runtimeConfig.runtime` instead of hardcoded defaults. Also removes a debug console.log, fixes an outdated comment in app.ts, adds a Dockerfile comment, and adds a workflow comment for FCAK creation.
---
"everything-dev": patch
---

Refactor CI/release workflows: rename `release-sync.yml` template to `release.yml` and make it a reusable `workflow_call`, add `fail_on_critical_high` input to CI audit step, split parent release into `publish` + `deploy` jobs calling the template, and clean up obsolete `release-sync.yml` on upgrade. Also improve config logging: when a target uses `extends`, log `[Config] Resolving "app.auth" from bos://...` instead of the generic "No development target" warning.
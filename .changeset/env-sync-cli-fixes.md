---
"everything-dev": patch
---

Keep generated local infra files in sync across init, sync, dev, and start by using a single env/docker generation path from resolved `bos.config.json` secrets. Also preserve child project package names and default root scripts during upgrade, prevent catalog values from being downgraded by template sync, ensure child workflow files come from `.github/templates`, and make publish workflows always republish runtime config while still using changesets to decide which app modules deploy.

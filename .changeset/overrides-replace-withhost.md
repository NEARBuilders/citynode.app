---
"everything-dev": minor
---

Replace `--withHost` with `--overrides` flag for `bos init`. The new `--overrides` flag accepts a comma-separated list of sections to include locally: `ui`, `api`, `host`, `plugins`. Default is `ui,api` — a minimal config that inherits everything else from the parent at runtime. Use `--overrides=ui,api,host,plugins` to match the old `--withHost` behavior. Specifying `--overrides=plugins` (with or without `--plugins`) controls which plugins get local source. Plugin inheritance via `extends` works without local overrides — `--overrides=plugins` is only needed for local plugin development. Also adds automatic `repository` detection from git remote and produces a minimal `bos.config.json` by default.
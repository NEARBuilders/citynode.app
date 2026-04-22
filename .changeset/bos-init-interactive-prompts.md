---
"everything-dev": patch
---

Fix bos init: add interactive prompts, fix --with-host, separate noInstall/noInteractive

- `account` and `gateway` are now optional — running `bos init` without them shows interactive prompts defaulting to `dev.everything.near` / `everything.dev`
- `--with-host` now correctly copies host files (was broken: `.templatekeep` doesn't include `host/**`)
- `--no-install` no longer implied by `--no-interactive` — they are independent controls
- `name` and `domain` fall back to `account` / `gateway` when not provided, so generated `bos.config.json` is personalized instead of retaining parent values
- Prompts for project directory name (defaults to gateway)

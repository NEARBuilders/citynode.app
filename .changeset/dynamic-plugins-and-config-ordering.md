---
"everything-dev": minor
---

Remove hardcoded plugin list and fix bos.config.json field ordering

- **Dynamic plugin discovery**: The `AVAILABLE_PLUGINS` hardcoded array (containing only "settings") is gone. Plugin options are now discovered from the parent config's `plugins` key, so `bos init` shows whatever plugins the parent template actually offers.

- **Removed `["settings"]` fallback**: `bos init` no longer defaults to `["settings"]` when no plugins are specified. The user selects plugins or gets none.

- **Fixed config field ordering**: `title` and `description` are now placed after `domain` in `bos.config.json` (was: after `shared`), matching the intended order: `extends → account → domain → title → description`.

- **Fixed plugin leakage during sync/upgrade**: `personalizeConfig` now correctly filters out unwanted plugins when `opts.plugins` is an empty array (previously skipped filtering, letting all parent plugins through).

- **Removed `plugins/settings/**` from `.templatekeep`**: Plugin source files are no longer hard-coded into the template; only `plugins/*/bos.config.json` is included so init/sync can set up plugin configs for selected plugins.
---
"every-plugin": minor
"everything-dev": minor
---

Plugin build framework consolidation: `EveryPluginComposedBuild` (the rspack stack — manifest emission + Module Federation + MF data-URI fix — in one composed plugin) and `createPluginBaseConfig()` replace per-workspace config boilerplate; `withPluginDeploy` (everything-dev/integrity) wraps the Zephyr deploy hook with integrity reporting. New `every-plugin <dev|types|build|deploy>` CLI is the plugin package contract, absorbing the `build:types → tsc → rspack` chain; per-workspace scripts shrink to one-liners and `every-plugin-serve` bin is a single source import.

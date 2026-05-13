---
"everything-dev": patch
"every-plugin": patch
---

Reverted catalog dependencies to stable versions:

- @rspack/core: 2.0.3 → 1.7.11
- @rspack/cli: 2.0.3 → 1.7.11
- @rsbuild/core: 2.0.6 → 1.7.5
- @rsbuild/plugin-react: 2.0.0 → 1.4.6
- @module-federation/enhanced: 2.4.0 → 2.3.2
- @module-federation/node: 2.7.42 → 2.7.40
- @module-federation/rsbuild-plugin: 2.4.0 → 2.3.2
- @module-federation/runtime-core: 2.4.0 → 2.3.2
- @module-federation/sdk: 2.4.0 → 2.3.2
- @module-federation/dts-plugin: 2.4.0 → 2.3.2

The 2.0 rspack/rsbuild and 2.4 module-federation upgrades introduced breaking
dev-server middleware API changes that broke plugin hot-reload. Reverting to
the last known-good 1.7.x / 2.3.2 line until the ecosystem stabilizes.

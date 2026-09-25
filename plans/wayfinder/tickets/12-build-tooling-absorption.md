## Question

Should the root `app.ts` descriptor absorb `bos.config.json` and `railway.toml` (and the surrounding build-tooling chain), and in what phases?

## Resolution

**Phase 1 executed; phase 2 drafted — not scheduled.**

- Phase 1 executed via [ADR 0002](../../../docs/adr/0002-plugin-build-composition.md) – [ADR 0004](../../../docs/adr/0004-dev-serve-entry-resolution.md): the rspack plugin stack composed into `every-plugin` (`EveryPluginComposedBuild` + `createPluginBaseConfig`), the `every-plugin dev|types|build|deploy` CLI as the plugin package contract, serve bin reduced to a one-line source import. Per-workspace rspack configs, script chains, and the dev-serve bin dispatch are gone — workspaces ship zero build config by default (CLI synthesizes the composed stack, opt-in `build.config.ts` overrides). `withPluginDeploy` (integrity) owns the Zephyr/SRI/report seam.
- Phase 2 (root `app.ts` absorbing `bos.config.json` + `railway.toml`, Effect pipeline) is drafted in [ADR 0005](../../../docs/adr/0005-app-ts-authored-descriptor.md); the descriptor runtime side is tracked in `advisor-plans/028-app-ts-descriptor.md` (Phase 0 shipped, full execution gated on plan 034).

## Question

When and how is `app.ts` evaluated to produce the deployable config (TOML on FastKV)?

`app.ts` is a TypeScript file that calls `App()`, `Plugin()`, `WebPlugin()`, etc. — constructors that produce a typed configuration object. But TOML is the serialization format on FastKV, and the host reads either TOML (today) or the evaluated result.

Options to evaluate:
1. **Build-time evaluation** — `bos build` (or equivalent) runs `app.ts` with Bun/Node, evaluates the `App(...)` call, serializes the result to TOML, publishes to FastKV. The host reads TOML from FastKV (same as today). Pro: host unchanged, TOML is human-readable on-chain. Con: `app.ts` runs arbitrary code at build time — security and determinism concerns.
2. **Static parsing** — a custom TypeScript AST walker extracts the `App(...)` call arguments without executing code. Only literal values and `Plugin("name").path("dir").extends("url")` chains are parsed. Pro: no arbitrary code execution, deterministic. Con: limited expressiveness, complex parser, can't resolve dynamic values.
3. **Effect.ts evaluation** — `App()` returns an `Effect` that resolves plugin paths, scans workspaces, detects URLs. `bos build` runs the Effect to produce the final config. Pro: Effect.ts idiomatic, composable, error handling built in. Con: Effect.ts runtime dependency at build time.
4. **Hybrid** — static parsing for the structure (keys, plugin names), build-time evaluation only for resolution (turning `path: "plugins/registry"` into actual URLs). Pro: balances safety and power. Con: two-phase complexity.

Key sub-questions:
- Does `app.ts` need to run at dev time (for hot reload) differently than at deploy time (for TOML generation)?
- If `app.ts` runs at build time, how do we handle secrets/environment variables that differ between dev and prod?
- Can `Plugin("registry").path("plugins/registry")` resolve to a URL at build time by scanning `plugins/registry/package.json` + `rsbuild.config.ts`?
- How does `extends: "bos://auth.near/auth.dev#app.auth"` resolve? Fetch from FastKV at build time? Or resolve at host runtime as today?

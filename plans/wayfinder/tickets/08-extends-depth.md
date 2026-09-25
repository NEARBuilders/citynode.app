## Question

How do transitive `extends` chains resolve — can a runtime extend a runtime that extends another, how deep, and what does publishing flatten?

## Resolution

**RESOLVED.**

- Multi-level `extends` chains are supported; each hop is verified (integrity/config check per link) before resolution proceeds.
- Chain depth is capped at 5 to bound resolution cost and failure diagnostics.
- Publish-time flattening: `bos publish` resolves the full chain and writes the flattened result, so runtime consumers never walk the chain themselves.

State as of 2026-09: implemented — the resolved-config lifecycle and deep-merge semantics are documented in the `everything-dev#extends-config` guidance; per-environment parents (`bos.dev.ts`) overlay the resolved config in development only.

---
"every-plugin": major
"better-near-auth": major
"everything-dev": minor
"@everything-dev/auth-plugin": major
---

Adopt the Effect DevTools toolchain: native TypeScript 7 (`@effect/tsgo`) with the Effect language-service plugin, and Oxlint with type-aware Effect rules.

TypeScript peer/dev ranges are narrowed to `^7.0.2` (no more `^5` support): `every-plugin`, `better-near-auth`, and `@everything-dev/auth-plugin` now require TypeScript 7, and `everything-dev` moves its devDependency to `^7.0.2`. Builds are unaffected (rspack/rsbuild transpile); typechecks and the editor language service run on the patched TS 7 native compiler.

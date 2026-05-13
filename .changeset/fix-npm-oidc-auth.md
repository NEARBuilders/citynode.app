---
"everything-dev": patch
---

fix(ci): restore empty `NODE_AUTH_TOKEN` env var for npm provenance publishing

Commit `4c72604` removed `NODE_AUTH_TOKEN` from the npm publish steps when switching to OIDC trusted publishing. However, `actions/setup-node` with `registry-url` generates an `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`. When this env var is completely absent, npm fails with `OIDC publish authorize: Invalid token` because the `.npmrc` placeholder is unresolved.

Restoring `NODE_AUTH_TOKEN: ""` satisfies the `.npmrc` syntax while allowing npm to fall through to the GitHub OIDC token for `--provenance` authentication.

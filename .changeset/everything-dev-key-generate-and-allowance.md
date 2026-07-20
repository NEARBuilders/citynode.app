---
"everything-dev": minor
---

Increase default publish key allowance from `0.25NEAR` to `1NEAR` to cover the NEP-642 10x gas purchase price increase. Enforce a minimum of `0.3NEAR` on `--allowance`.

Rename `bos key publish` → `bos key generate` — "publish" was misleading since nothing is published.

`bos key generate` now lists existing publish keys, generates the new key first, then prompts to remove the old ones (no more manual `near account delete-keys` step).

Better error message when the publish key has insufficient allowance — tells the user to run `bos key generate`.

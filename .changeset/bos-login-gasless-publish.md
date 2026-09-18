---
"everything-dev": minor
---

`bos login` — sign in with your NEAR account through the hosted site (SIWN supported; passkeys/social wherever the site enables them), `--key` exports a scoped FastKV publish key to `~/.near-credentials`, `bos logout` revokes the credential. `bos publish --wallet` publishes gaslessly via a NEP-366 delegate action through the platform relayer (one wallet approval to mint the delegate key). New `publish.auth` config surface (`session` | `key` | `custody`). The site's `/login` now preserves full redirect targets including query strings.

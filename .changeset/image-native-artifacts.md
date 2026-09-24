---
"everything-dev": minor
---

Image-native artifacts: the runtime image stages every workspace's dists and the host serves them same-origin from `/bundles/<account>/<gateway>/<workspace>/…` (`BOS_BUNDLE_DIR`). `deploy.cdn` now defaults to `"platform"`; the platform publish writes deterministic bundle URLs — no CLI session, no uploads, no Zephyr. Deploy workflow: publish (config to FastKV) → `railway up` (image build ships the artifacts) → `bos mf check` gate. Supersedes the DB-backed bundle storage pre-release (ADR 0011).

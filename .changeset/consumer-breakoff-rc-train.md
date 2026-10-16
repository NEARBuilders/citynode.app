---
"ui": minor
"api": minor
"@everything-dev/auth-plugin": minor
"@everything-dev/proposals-plugin": minor
"@everything-dev/registry-plugin": minor
---

Consumer break-off: the app now extends the published base runtime (`bos://dev.everything.near/everything.dev`) on the latest RC train — everything-dev 2.0.0-rc.7, every-plugin 3.0.0-rc.4, better-near-auth 2.0.0-rc.0 — instead of vendoring the fork. Deploys are image-backed on the base's floating `everything-dev:rc` image (no local Docker build), and the citynode browser regression suite runs the retained app specs against a local `bos dev` stack on the adopted upstream harness (dev:ssr project; image-level validation is the deploy train's smoke gate).

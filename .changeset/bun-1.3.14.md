---
"everything-dev": patch
---

Upgrade Bun from 1.2.20 to 1.3.14 across all GitHub workflows, workflow templates, the root `package.json` `packageManager` field, and the Dockerfile base image. This also resolves the `bun audit` hang (oven-sh/bun#20800) that affected 1.2.20, making the CI audit timeout workaround no longer strictly necessary.

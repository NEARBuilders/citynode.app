---
"everything-dev": patch
---

Fix non-fast-forward push failure in Deploy and Staging workflows. The `Commit and push bos.config.json updates` step used a naive `git push` that failed when `main` moved forward during the ~80s deploy run. Ported the retry-with-rebase pattern from the template workflows: up to 3 attempts of `git pull --rebase` + `git push` with 3s sleep between attempts.

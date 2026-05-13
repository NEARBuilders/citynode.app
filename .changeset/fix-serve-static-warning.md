---
"host": patch
---

Fix spurious `serveStatic: root path './dist' is not found` warning in development by skipping the static file middleware when `./dist` doesn't exist.
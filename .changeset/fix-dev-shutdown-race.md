---
"every-plugin": patch
---

Fix race condition in dev-server middleware: null request handlers before calling runtime.shutdown() to prevent in-flight requests from hitting dead database pools during hot reload

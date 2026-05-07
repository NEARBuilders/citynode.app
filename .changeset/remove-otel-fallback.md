---
"host": patch
"every-plugin": patch
---

Remove `@opentelemetry/api` resolve.fallback stub.

The package is now a direct dependency, so the `false` fallback workaround is no longer needed. Bundlers will resolve it normally.

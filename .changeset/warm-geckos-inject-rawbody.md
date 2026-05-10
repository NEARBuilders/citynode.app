---
"every-plugin": patch
"api": patch
"host": patch
"@everything-dev/projects-plugin": patch
"@everything-dev/registry-plugin": patch
"@every-plugin/template": patch
---

Inject `getRawBody` and `reqHeaders` into oRPC handler context so plugins can verify webhook signatures

- Host session middleware now clones the request body before oRPC consumes it, exposing `getRawBody()` in context for raw body access
- Dev server middleware also injects `reqHeaders` and `getRawBody` (previously passed `context: {}`)
- API, projects, registry, and template plugins declare `getRawBody` in their context schemas
- API plugin `reqHeaders` type changed from `z.custom<Record<string, string>>()` to `z.record(z.string(), z.string())` for proper runtime validation

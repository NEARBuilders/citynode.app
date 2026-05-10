---
"api": patch
"host": patch
"every-plugin": patch
"@everything-dev/registry-plugin": patch
"@everything-dev/projects-plugin": patch
"@every-plugin/template": patch
---

Fix `reqHeaders` runtime type to be a real `Headers` instance instead of `Record<string, string>`, preventing `TypeError: undefined is not a function` when calling `.get()` in plugin handlers

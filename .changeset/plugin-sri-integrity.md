---
"@everything-dev/registry-plugin": patch
"@everything-dev/projects-plugin": patch
"@everything-dev/opencode-plugin": patch
---

Add SRI integrity hashes to plugin deployments

Plugin rspack configs now compute SHA-384 integrity hashes on deploy and write `productionIntegrity` to `bos.config.json`, matching the existing behavior of `api`, `ui`, and `host` packages.

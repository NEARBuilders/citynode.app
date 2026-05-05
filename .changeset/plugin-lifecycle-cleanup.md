---
"every-plugin": minor
"api": patch
"everything-dev": minor
"@everything-dev/projects-plugin": patch
"@everything-dev/registry-plugin": patch
---

Improve plugin lifecycle cleanup, add additionalExports, and share BosConfigInput

Plugin shutdown now logs warnings instead of silently swallowing errors. DB layers use Effect acquireRelease for proper connection cleanup. Build system supports additionalExports for bundling extra type files. BosConfigInput is now exported from everything-dev/types for shared use. Registry plugin validates private key format before creating relay clients.

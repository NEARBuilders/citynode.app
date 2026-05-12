---
"everything-dev": patch
---

Replace `node:child_process` spawn with `shell: true` by `execa` for cross-platform command execution, eliminating the DEP0190 deprecation warning
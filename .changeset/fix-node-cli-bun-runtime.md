---
"everything-dev": patch
---

Fix the published `bos` CLI when it is launched via Node. The CLI binary is installed with a Node shebang, but the `dev` code path still used `Bun.spawn()` and `Bun.file()`, which caused `Bun is not defined` at runtime. Process execution now uses `execa`, and file reads in the plugin handler now use standard Node filesystem APIs so the distributed CLI works correctly in its packaged runtime.

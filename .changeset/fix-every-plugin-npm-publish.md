---
"every-plugin": patch
---

Fix npm publish: `main`, `module`, and `types` fields must be strings

npm requires `main`, `module`, and `types` to be plain strings, not conditional objects. The conditional resolution is handled by the `exports` field, so these fields now point to production defaults (`./dist/*`).

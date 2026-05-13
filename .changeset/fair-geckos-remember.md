---
"everything-dev": patch
---

Lazy-load the dev runtime so `bos types gen` does not pull in `@effect/platform-node` during CLI startup, and add regression coverage for init-generated projects running type generation after install.

---
"every-plugin": patch
"everything-dev": patch
---

Fix framework package publishing and installability by normalizing workspace and catalog dependencies for release builds and generated apps, aligning repository metadata for npm provenance, and embedding the every-plugin runtime version at build time instead of reading package.json from deployed artifacts.

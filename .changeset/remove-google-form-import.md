---
"api": patch
---

Removed the one-shot script that imported event reports already sent through Google Forms (`api/scripts/import-google-form-reports.ts`), along with its helper library and tests. Nothing else used them.

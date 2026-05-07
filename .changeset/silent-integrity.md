---
"everything-dev": patch
---

Remove noisy `[SRI] Integrity verified for ...` console.log from `verifySriForUrl`.

The success log fired on every integrity check (plugin loads, SSR boot, and periodic production monitor), producing excessive output. Failures still throw descriptive errors. Silent success, loud failure.

---
"host": patch
---

Relaxed CORS origin check to allow any `https://` origin while still respecting `CORS_ORIGIN` for explicit allow-listing. Added `frameSrc` to the Content Security Policy to permit external `https:` frames, fixing blocked wallet iframe loads.

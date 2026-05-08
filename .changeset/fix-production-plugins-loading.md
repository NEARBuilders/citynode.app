---
"everything-dev": patch
---

Fix plugins not loading in production: `bos start` now always resolves plugin URLs for production mode instead of using development-resolved configs with empty URLs

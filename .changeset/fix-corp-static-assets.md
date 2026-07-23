---
"host": patch
---

Set `Cross-Origin-Resource-Policy: cross-origin` on static asset responses (favicon, og:image, manifest, etc.) so social media crawlers and link-preview tools can load them cross-origin. HTML and API responses retain `same-origin` CORP.

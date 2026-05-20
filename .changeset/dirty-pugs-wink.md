---
"host": patch
"ui": patch
---

Fix production SSR by keeping the UI auth client local during server rendering and by resolving SSR-imported asset URLs from the UI remote instead of the host origin.

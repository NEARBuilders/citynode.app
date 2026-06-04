---
"everything-dev": patch
"host": patch
"ui": patch
---

Version asset URLs to prevent stale-cache chunk failures

Client boot assets (`remoteEntry.js`, `style.css`, plugin UI remote entries) now include a `?v=<integrity>` query parameter matching the SSR pattern. This ensures browsers and CDNs serve the correct asset set after each deploy, eliminating `ChunkLoadError` caused by cached `remoteEntry.js` referencing async chunks that no longer exist on the upstream deployment.

Also fixes the `_viewer` regex from invalid `/^/+/` to `/^\/+/`.
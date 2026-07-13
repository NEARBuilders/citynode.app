---
"everything-dev": patch
---

Fix remote plugin probe failures from high-latency regions

Remote plugin health checks in `bos dev` used a 400ms timeout per HTTP probe, which is insufficient for TLS handshakes from regions with high RTT to the CDN (e.g. Pakistan → US edge ~300ms RTT). This caused deterministic failures where the same plugins always failed while others always succeeded, depending on which CDN edge node they routed to.

- Increase remote probe timeout from 400ms to 5000ms
- Add 0-2000ms random jitter before first probe to spread concurrent TLS handshakes
- Add exponential backoff (1s → 1.5x → cap 15s) to polling interval so failing probes ease off instead of hammering
- Add 10s timeout to host manifest fetch to prevent indefinite hang if CDN is unreachable

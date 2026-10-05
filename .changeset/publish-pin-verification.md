---
"everything-dev": patch
---

Publishes are now gated on pin verification: before submitting the config transaction, every slot with a version-manifest pin is fetched at its production URL and SRI-checked (the same verifier rollback uses). A publish whose pinned bytes 404 or mismatch is refused with a structured error naming the failing slots — a broken config can no longer go live and fail at boot.

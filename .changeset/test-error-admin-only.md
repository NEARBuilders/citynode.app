---
"api": patch
---

The `testError` route, which throws a requested error kind to exercise the host's error handling, now requires a signed-in platform admin. It was open to anonymous callers on every deployment. Anonymous callers get `UNAUTHORIZED` and signed-in non-admins get `FORBIDDEN`.

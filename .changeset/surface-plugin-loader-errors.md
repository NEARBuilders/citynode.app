---
"every-plugin": patch
---

Fixed error swallowing in plugin loader `tapError` logs — `register-remote`, `load-remote`, `instantiate-plugin`, and `initialize-plugin` failures now include the actual error message instead of discarding it.

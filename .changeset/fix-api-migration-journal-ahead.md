---
"api": patch
---

Fixes the production boot failure (`journal-ahead` migration guard) by restoring the
trailing newline on migrations `0009_windy_zemo` and `0010_flawless_slipstream`.

The production database was migrated on Nov 9 from a working tree where both files
ended with a newline; the committed files lost it, so every deployed build hashes them
differently (migration hashes are sha256 of the raw file bytes) and the api plugin
refuses to boot — every `/api/*` route 503s and tenant-domain SSR fails. SQL semantics
are unchanged; only the file bytes return to what the journal already recorded.

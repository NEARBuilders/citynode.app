---
"ui": patch
"api": patch
---

The member directory no longer reads every community member on each view. Access is checked with one role lookup, `getMemberDirectory` returns one page of members at a time with `limit`, `cursor` and `nextCursor`, and Overview has a Load more button. Opening the directory makes the same number of auth calls at any community size, and the stored member count is only rewritten when it changes or is over an hour old.

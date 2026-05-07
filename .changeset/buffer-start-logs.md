---
"everything-dev": patch
---

Buffer startup and streaming view headers into single console.log writes.

Replaces scattered `console.log()` calls in `bos start` summary and
`renderStreamingView` header/ready block with single buffered strings.
Prevents stdout interleaving when multiple streams write concurrently
in non-interactive / Docker / CI environments.

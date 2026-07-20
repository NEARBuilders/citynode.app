---
"host": patch
---

Fixed SSR crash when running `bos dev` with remote host but local UI without `--ssr`. The host was optimistically attempting to load the SSR module from the browser dev server URL (which doesn't serve `remoteEntry.server.js`), causing SSR failures and page breakage. Now SSR is only attempted when an SSR URL is explicitly configured.

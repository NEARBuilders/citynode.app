---
"everything-dev": patch
---

Fix Zephyr auth/output logs being silently suppressed during `bos publish --deploy`. Always forward stderr from build processes, broaden Zephyr log detection to catch all `ZEPHYR`-branded lines and `ZE` error codes, and include Zephyr context in upload failure messages.

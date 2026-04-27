---
"host": patch
---

Fix production deploy EACCES errors: appuser now owns /app, /app/data, and .bos directories so runtime file creation (database.db, logs, pids) works correctly in the Docker container

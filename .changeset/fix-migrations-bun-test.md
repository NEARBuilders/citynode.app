---
"api": patch
---
Fix virtual:drizzle-migrations.sql resolution in bun test by falling back to disk-read migrations when the virtual module is unavailable


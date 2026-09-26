---
"everything-dev": patch
---

Fix plugin boot failure from the concurrent-migration race: two processes initializing the same plugin against a fresh database (dev stacks boot both the plugin dev server and the host's in-process load) could collide on `CREATE TABLE` — the loser sees SQLSTATE 23505 on a pg_catalog unique index (`pg_type_typname_nsp_index`), which the migration runner's duplicate-DDL tolerance did not recognize, so the plugin load failed permanently and the host served without it. Catalog-collision 23505s are now tolerated at the SAVEPOINT level, and each migration transaction retries on deadlock/serialization/lock states. Browser regression global-setup also aborts immediately when the stack boots with a failed plugin instead of failing specs with downstream timeouts.

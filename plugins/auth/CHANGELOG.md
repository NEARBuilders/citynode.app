# @everything-dev/auth-plugin

## 1.2.0

### Minor Changes

- Migrate auth plugin from SQLite/libsql to PostgreSQL.

  ### Database

  - Replace `@libsql/client` + `drizzle-orm/libsql` with `pg` (production) and `@electric-sql/pglite` (local dev/tests).
  - Convert schema from `sqliteTable` to `pgTable` with `timestamp({ mode: "date", withTimezone: true })` and `boolean` columns.
  - Update `drizzle.config.ts` dialect from `turso` to `postgresql`.
  - Generate fresh PostgreSQL migration set.
  - Replace custom SQLite migrator with standard `drizzle_migrations` PostgreSQL migrator with transaction-wrapped migrations.

  ### Auth Instance

  - Switch Better-Auth Drizzle adapter provider from `sqlite` to `pg`.
  - Fix `.insert().returning().get()` to `.insert().returning()` (PostgreSQL returns arrays).

  ### Plugin Configuration

  - Remove `AUTH_DATABASE_AUTH_TOKEN` secret (PostgreSQL connection strings encode the password).
  - Default `AUTH_DATABASE_URL` changed to `pglite:./auth-local.db` for zero-config local development.
  - Add `pg` to dependencies, `@types/pg` and `@electric-sql/pglite` to devDependencies.
  - Externalize both `pg` and `@electric-sql/pglite` in rspack config for Module Federation.

  ### Tests

  - Update `near.test.ts` to use `:memory:` pglite database.
  - Remove all `as any` casts; use `@ts-expect-error` for better-near-auth plugin API calls.

  ### Documentation

  - Update `.env.example`, `bos.config.json`, `README.md`, and `LLM.txt` to reflect PostgreSQL.

### Patch Changes

- Updated dependencies [a38288d]
  - every-plugin@2.5.2

## 1.1.4

### Patch Changes

- Updated dependencies [f185a6c]
  - every-plugin@2.5.1

## 1.1.3

### Patch Changes

- Updated dependencies [516376e]
  - every-plugin@2.5.0

## 1.1.2

### Patch Changes

- Updated dependencies [b20445f]
  - every-plugin@2.4.3

## 1.1.1

### Patch Changes

- Updated dependencies [fac9cf6]
  - every-plugin@2.4.2

## 1.1.0

### Minor Changes

- 0a67206: Refactor dev orchestrator to service-descriptor architecture; add NEAR auth contract routes (nonce, verify, profile, relay, view); consolidate session queries in UI; add source-map devtool for plugin builds

### Patch Changes

- Updated dependencies [0a67206]
  - every-plugin@2.4.1

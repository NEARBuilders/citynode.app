import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization, testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "../fixtures/auth/schema.ts";

/**
 * Test-only Better Auth instance for regression fixtures.
 *
 * Uses a frozen snapshot of the upstream auth plugin's schema (see
 * `tests/regression/fixtures/auth/schema.ts`) through the same
 * `drizzleAdapter` wiring as the production instance, plus `testUtils()` —
 * the documented Better Auth pattern for integration/E2E fixtures. Sessions
 * and users minted here validate against the running server because the
 * secret and auth database are shared.
 *
 * No migration pass here: the stack applies the remote plugin's own migrations
 * at boot, before Playwright's `/health` gate, which runs ahead of every seed.
 */

export async function createAuthTestInstance({ authDatabaseUrl, secret }) {
  if (!authDatabaseUrl) throw new Error("AUTH_DATABASE_URL is not configured");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");

  const pool = new Pool({ connectionString: authDatabaseUrl, max: 1 });
  const db = drizzle(pool, { schema: authSchema });

  const auth = betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    plugins: [testUtils(), organization(), admin()],
  });
  const ctx = await auth.$context;
  return {
    auth,
    test: ctx.test,
    db,
    close: async () => {
      await pool.end();
    },
  };
}

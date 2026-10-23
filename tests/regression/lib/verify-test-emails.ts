import { inArray } from "drizzle-orm";
import { user } from "../fixtures/auth/schema";
import { createAuthTestInstance } from "./auth-test-instance";
import { computeRegressionEnv } from "./regression-env.mjs";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("User fixture ids are required");
const env = computeRegressionEnv();
const fixture = await createAuthTestInstance({
  authDatabaseUrl: env.dbUrls.AUTH_DATABASE_URL,
  secret: env.authSecret,
});
try {
  await fixture.db.update(user).set({ emailVerified: true }).where(inArray(user.id, ids));
} finally {
  await fixture.close();
}

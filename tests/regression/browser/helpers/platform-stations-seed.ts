import { randomUUID } from "node:crypto";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";

type Cookie = Awaited<
  ReturnType<Awaited<ReturnType<typeof createAuthTestInstance>>["test"]["login"]>
>["cookies"][number];

export interface PlatformAdmin {
  cookies: Cookie[];
}

export async function seedPlatformAdmin(): Promise<PlatformAdmin> {
  const regressionEnv = computeRegressionEnv();
  const { test, close } = await createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
  try {
    const admin = await test.saveUser(
      test.createUser({
        email: `regression-platform-stations-${randomUUID().slice(0, 8)}@citynode.test`,
        name: "Regression platform admin",
        emailVerified: true,
        role: "admin",
      }),
    );
    const { cookies } = await test.login({ userId: admin.id });
    return { cookies };
  } finally {
    await close();
  }
}

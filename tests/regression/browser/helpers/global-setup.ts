import fs from "node:fs";
import path from "node:path";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";

const ADMIN_COOKIES_PATH = ".bos/regression/admin-cookies.json";
const LOGOUT_COOKIES_PATH = ".bos/regression/logout-cookies.json";
const ADMIN_SEED_PATH = ".bos/regression/admin-seed.json";
const ADMIN_NAME = "admin.near";
const LOGOUT_NAME = "logout.near";

export default async function globalSetup() {
  const regressionEnv = computeRegressionEnv();
  const authDatabaseUrl =
    process.env.AUTH_DATABASE_URL ?? regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "";
  const secret = process.env.BETTER_AUTH_SECRET ?? regressionEnv.authSecret;

  const { test } = await createAuthTestInstance({ authDatabaseUrl, secret });

  const unique = `${process.pid}`;
  const admin = await test.saveUser(
    test.createUser({
      email: `regression-admin-${unique}@citynode.test`,
      name: ADMIN_NAME,
      role: "admin",
      emailVerified: true,
    }),
  );

  const orgAName = `regression-admin-org-a-${unique}`;
  const orgBName = `regression-admin-org-b-${unique}`;
  const orgA = await test.saveOrganization(test.createOrganization({ name: orgAName, slug: orgAName }));
  const orgB = await test.saveOrganization(test.createOrganization({ name: orgBName, slug: orgBName }));
  await test.addMember({ userId: admin.id, organizationId: orgA.id, role: "admin" });
  await test.addMember({ userId: admin.id, organizationId: orgB.id, role: "admin" });

  const cookies = await test.getCookies({ userId: admin.id, domain: "localhost" });

  const logoutUser = await test.saveUser(
    test.createUser({
      email: `regression-logout-${unique}@citynode.test`,
      name: LOGOUT_NAME,
      emailVerified: true,
    }),
  );
  const logoutCookies = await test.getCookies({ userId: logoutUser.id, domain: "localhost" });

  const cookiesResolved = path.resolve(process.cwd(), ADMIN_COOKIES_PATH);
  fs.mkdirSync(path.dirname(cookiesResolved), { recursive: true });
  fs.writeFileSync(cookiesResolved, JSON.stringify(cookies, null, 2));
  console.log(`[global-setup] wrote ${cookiesResolved}`);

  const logoutCookiesResolved = path.resolve(process.cwd(), LOGOUT_COOKIES_PATH);
  fs.writeFileSync(logoutCookiesResolved, JSON.stringify(logoutCookies, null, 2));
  console.log(`[global-setup] wrote ${logoutCookiesResolved}`);

  const seedResolved = path.resolve(process.cwd(), ADMIN_SEED_PATH);
  fs.writeFileSync(
    seedResolved,
    JSON.stringify(
      { adminName: ADMIN_NAME, logoutName: LOGOUT_NAME, orgAName, orgBName },
      null,
      2,
    ),
  );
  console.log(`[global-setup] wrote ${seedResolved}`);
}

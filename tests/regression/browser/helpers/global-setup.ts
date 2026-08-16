import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const AUTH_DATABASE_URL =
  process.env.AUTH_DATABASE_URL ?? "postgres://everythingdev:everythingdev@127.0.0.1:5433/auth_db";
const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? "regression-test-secret-do-not-use-in-production";
const ADMIN_USER_ID = "regression-admin-user";
const ADMIN_SESSION_TOKEN = "regression-admin-session-token";
const ADMIN_COOKIES_PATH = ".bos/regression/admin-cookies.json";
const COOKIE_NAME = "better-auth.session_token";

function signCookieValue(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function seedAdmin() {
  const client = new pg.Client({ connectionString: AUTH_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, $4, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
      [ADMIN_USER_ID, "admin.near", "admin@everything.near", "admin"],
    );
    await client.query(
      "INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT DO NOTHING",
      [`${ADMIN_USER_ID}-account`, "admin.near:mainnet", "siwn", ADMIN_USER_ID],
    );
    await client.query(
      "INSERT INTO near_account (id, user_id, account_id, network, public_key, is_primary, created_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) ON CONFLICT DO NOTHING",
      [`${ADMIN_USER_ID}-near`, ADMIN_USER_ID, "admin.near", "mainnet", "ed25519:test"],
    );
    await client.query(
      "INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) VALUES ($1, NOW() + INTERVAL '1 year', $2, NOW(), NOW(), $3, $4, $5) ON CONFLICT (token) DO NOTHING",
      [`${ADMIN_USER_ID}-session`, ADMIN_SESSION_TOKEN, "", "regression", ADMIN_USER_ID],
    );
  } finally {
    await client.end();
  }
}

async function writeAdminCookies() {
  const value = signCookieValue(ADMIN_SESSION_TOKEN, BETTER_AUTH_SECRET);
  const cookies = [
    {
      name: COOKIE_NAME,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ];
  const resolved = path.resolve(process.cwd(), ADMIN_COOKIES_PATH);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(cookies, null, 2));
  console.log(`[global-setup] wrote ${resolved}`);
}

export default async function globalSetup() {
  await seedAdmin();
  await writeAdminCookies();
}

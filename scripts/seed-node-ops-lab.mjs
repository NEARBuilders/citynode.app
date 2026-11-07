#!/usr/bin/env node
/**
 * Local-only fixture for issue #484 (node-operations UI access).
 *
 * Usage:
 *   node --import tsx scripts/seed-node-ops-lab.mjs --account you.near --as owner
 *   node --import tsx scripts/seed-node-ops-lab.mjs --account you.near --as ops
 *   node --import tsx scripts/seed-node-ops-lab.mjs --account you.near --as plain
 *
 * Aborts unless AUTH_DATABASE_URL and API_DATABASE_URL point at localhost /
 * 127.0.0.1 (or pass --allow-remote deliberately). --as switches that NEAR
 * account's Harbor Demo membership so the same wallet can exercise owner,
 * node-operations-only, and plain-member paths.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import pg from "pg";
import * as authSchema from "../tests/regression/fixtures/auth/schema.ts";
import { createAuthTestInstance } from "../tests/regression/lib/auth-test-instance.ts";
import { readDotEnv } from "../tests/regression/lib/regression-env.mjs";

const ORG_SLUG = "harbor-demo";
const MODES = new Set(["owner", "ops", "plain"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function flagValue(name) {
  const eqArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const mode = flagValue("--as") ?? "owner";
const nearAccount = flagValue("--account");
const allowRemote = process.argv.includes("--allow-remote");

if (!MODES.has(mode)) {
  console.error(`Unknown --as ${mode}. Use owner | ops | plain.`);
  process.exit(1);
}
if (!nearAccount) {
  console.error(
    "Missing --account <near-account-id> (e.g. --account you.near). Refusing a hard-coded account.",
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = readDotEnv(root);
const pick = (key, fallback) => {
  const fromEnv = process.env[key];
  if (fromEnv && !fromEnv.startsWith("pglite:")) return fromEnv;
  const fromFile = fileEnv[key];
  if (fromFile && !fromFile.startsWith("pglite:")) return fromFile;
  return fallback;
};

const authDatabaseUrl = pick(
  "AUTH_DATABASE_URL",
  "postgres://everythingdev:everythingdev@127.0.0.1:5433/auth_db",
);
const apiDatabaseUrl = pick(
  "API_DATABASE_URL",
  "postgres://everythingdev:everythingdev@127.0.0.1:5432/api_db",
);
const secret = process.env.BETTER_AUTH_SECRET || fileEnv.BETTER_AUTH_SECRET;
if (!secret) {
  console.error("BETTER_AUTH_SECRET is required in .env");
  process.exit(1);
}

function assertLocalDatabaseUrl(label, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }
  if (parsed.protocol === "pglite:") {
    throw new Error(
      `${label} is pglite (${url}). Point it at local docker Postgres for this script.`,
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    throw new Error(
      `${label} host "${parsed.hostname}" is not local. Refusing to mutate roles off localhost. Pass --allow-remote only if you intend this.`,
    );
  }
}

assertLocalDatabaseUrl("AUTH_DATABASE_URL", authDatabaseUrl);
assertLocalDatabaseUrl("API_DATABASE_URL", apiDatabaseUrl);

console.log(`auth db: ${authDatabaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
console.log(`api db:  ${apiDatabaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
console.log(`account: ${nearAccount}`);

function sameAreaSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((area, index) => area === b[index]);
}

async function withApi(run) {
  const client = new pg.Client({ connectionString: apiDatabaseUrl });
  await client.connect();
  try {
    await client.query("SET search_path TO plugin_api, public");
    return await run(client);
  } finally {
    await client.end();
  }
}

async function ensureValidator(nodeId) {
  return withApi(async (client) => {
    const existing = await client.query(
      "SELECT id, account_id FROM validators WHERE node_id = $1 LIMIT 1",
      [nodeId],
    );
    if (existing.rows[0]) return existing.rows[0];
    const id = randomUUID();
    await client.query(
      `INSERT INTO validators (id, node_id, account_id, network, protocol, role, is_default, metadata)
       VALUES ($1, $2, $3, 'testnet', 'near', 'official', true, '{}'::jsonb)`,
      [id, nodeId, "harbor-demo.pool.f863973.m0"],
    );
    return { id, account_id: "harbor-demo.pool.f863973.m0" };
  });
}

async function ensureBulletin(nodeId) {
  return withApi(async (client) => {
    const row = await client.query("SELECT metadata FROM nodes WHERE id = $1", [nodeId]);
    const metadata = row.rows[0]?.metadata ?? {};
    if (typeof metadata.bulletin === "string" && metadata.bulletin.length > 0) {
      return metadata.bulletin;
    }
    const bulletin = "Node-ops lab bulletin — edit me to confirm setNodeBulletin works.";
    await client.query(
      `UPDATE nodes SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [nodeId, JSON.stringify({ bulletin })],
    );
    return bulletin;
  });
}

async function loadHarbor() {
  return withApi(async (client) => {
    const byAccount = await client.query(
      `SELECT id, name, org_id, account_id FROM tenants WHERE account_id = $1 AND deleted_at IS NULL LIMIT 1`,
      ["harbor-demo.testnet"],
    );
    const t = byAccount.rows[0];
    if (!t) throw new Error("Harbor Demo tenant missing — expected harbor-demo.testnet");
    const node = await client.query(
      `SELECT id, slug, name FROM nodes WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [t.id],
    );
    if (!node.rows[0]) throw new Error("Harbor Demo node missing");
    const binding = await client.query(
      `SELECT hostname FROM domain_bindings WHERE tenant_id = $1 ORDER BY is_primary DESC LIMIT 1`,
      [t.id],
    );
    return {
      tenant: t,
      node: node.rows[0],
      hostname: binding.rows[0]?.hostname ?? "harbor-demo",
    };
  });
}

async function ensureTeam(db, organizationId, name, areas) {
  const existing = await db.query.team.findMany({
    where: eq(authSchema.team.organizationId, organizationId),
  });
  const match = existing.find((team) => {
    try {
      const meta = JSON.parse(team.metadata ?? "{}");
      return sameAreaSet(meta.areas, areas);
    } catch {
      return false;
    }
  });
  if (match) return match;
  const now = new Date();
  const [row] = await db
    .insert(authSchema.team)
    .values({
      id: randomUUID(),
      name,
      organizationId,
      metadata: JSON.stringify({ areas }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function setTeamMembership(db, teamId, userId, shouldBelong) {
  const members = await db.query.teamMember.findMany({
    where: eq(authSchema.teamMember.teamId, teamId),
  });
  const mine = members.find((row) => row.userId === userId);
  if (shouldBelong && !mine) {
    await db.insert(authSchema.teamMember).values({
      id: randomUUID(),
      teamId,
      userId,
      createdAt: new Date(),
    });
  }
  if (!shouldBelong && mine) {
    await db.delete(authSchema.teamMember).where(eq(authSchema.teamMember.id, mine.id));
  }
}

function teamAreas(team) {
  try {
    const meta = JSON.parse(team.metadata ?? "{}");
    return Array.isArray(meta.areas) ? meta.areas : [];
  } catch {
    return [];
  }
}

/** Drop memberships on any org team that grants node-ops or events, except keepTeamId. */
async function clearLabAreaMemberships(db, organizationId, userId, keepTeamId = null) {
  const teams = await db.query.team.findMany({
    where: eq(authSchema.team.organizationId, organizationId),
  });
  for (const team of teams) {
    if (keepTeamId && team.id === keepTeamId) continue;
    const areas = teamAreas(team);
    if (!areas.includes("node-operations") && !areas.includes("events")) continue;
    await setTeamMembership(db, team.id, userId, false);
  }
}

async function main() {
  const harbor = await loadHarbor();
  const orgId = harbor.tenant.org_id;
  if (!orgId) throw new Error("Harbor Demo tenant has no org_id");

  const { test, db, close } = await createAuthTestInstance({
    authDatabaseUrl,
    secret,
    baseURL: "http://localhost:3000",
  });

  try {
    const nearRows = await db
      .select()
      .from(authSchema.nearAccount)
      .where(eq(authSchema.nearAccount.accountId, nearAccount));
    const near = nearRows[0];
    if (!near) throw new Error(`${nearAccount} has no near_account row — sign in once first`);

    const users = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, near.userId));
    const user = users[0];
    if (!user) throw new Error(`user row missing for ${nearAccount}`);

    // Platform admin only in owner mode. Ops/plain must stay role=user or the UI
    // treats them as canManageCommunity and skips the node-operations path.
    await db
      .update(authSchema.user)
      .set({ role: mode === "owner" ? "admin" : "user" })
      .where(eq(authSchema.user.id, user.id));

    const orgs = await db
      .select()
      .from(authSchema.organization)
      .where(eq(authSchema.organization.slug, ORG_SLUG));
    let organization = orgs[0];
    if (!organization) {
      organization = await test.saveOrganization(
        test.createOrganization({ name: "Harbor Demo", slug: ORG_SLUG }),
      );
    }
    if (organization.id !== orgId) {
      console.warn(
        `Warning: auth org ${organization.id} != tenant.org_id ${orgId}. Using tenant.org_id.`,
      );
      const byId = await db
        .select()
        .from(authSchema.organization)
        .where(eq(authSchema.organization.id, orgId));
      if (!byId[0]) throw new Error(`organization ${orgId} from tenant not found in auth db`);
      organization = byId[0];
    }

    const memberships = await db
      .select()
      .from(authSchema.member)
      .where(eq(authSchema.member.organizationId, organization.id));
    let membership = memberships.find((row) => row.userId === user.id);
    const orgRole = mode === "owner" ? "owner" : "member";
    if (!membership) {
      await test.addMember({
        userId: user.id,
        organizationId: organization.id,
        role: orgRole,
      });
      membership = (
        await db
          .select()
          .from(authSchema.member)
          .where(eq(authSchema.member.organizationId, organization.id))
      ).find((row) => row.userId === user.id);
    } else {
      await db
        .update(authSchema.member)
        .set({ role: orgRole })
        .where(eq(authSchema.member.id, membership.id));
    }

    const operations = await ensureTeam(db, organization.id, "Operations", ["node-operations"]);
    const community = await ensureTeam(db, organization.id, "Community", ["events"]);
    await ensureTeam(db, organization.id, "Treasury", ["finance", "stake"]);

    if (operations.id === community.id) {
      throw new Error(
        "Operations and Community resolved to the same team; areas must be exact-set matches.",
      );
    }

    // Exact-match ensureTeam can leave the user on a pre-existing combined
    // team (e.g. areas ["node-operations","events"]). Clear those first so
    // --as plain/owner never retain node-ops, and --as ops only keeps Operations.
    await clearLabAreaMemberships(
      db,
      organization.id,
      user.id,
      mode === "ops" ? operations.id : null,
    );
    await setTeamMembership(db, operations.id, user.id, mode === "ops");
    await setTeamMembership(db, community.id, user.id, false);

    await db
      .update(authSchema.session)
      .set({
        activeOrganizationId: organization.id,
        activeTeamId: mode === "ops" ? operations.id : null,
      })
      .where(eq(authSchema.session.userId, user.id));

    const validator = await ensureValidator(harbor.node.id);
    const bulletin = await ensureBulletin(harbor.node.id);

    const unique = randomUUID().slice(0, 8);
    const saveUser = async (label) =>
      test.saveUser(
        test.createUser({
          email: `node-ops-${label}-${unique}@citynode.test`,
          name: `node-ops-${label}.near`,
          emailVerified: true,
        }),
      );
    const opsUser = await saveUser("ops");
    const plainUser = await saveUser("plain");
    await test.addMember({ userId: opsUser.id, organizationId: organization.id, role: "member" });
    await test.addMember({ userId: plainUser.id, organizationId: organization.id, role: "member" });
    await setTeamMembership(db, operations.id, opsUser.id, true);

    const login = async (userId, activeTeamId = null) => {
      const { session, cookies } = await test.login({ userId });
      await db
        .update(authSchema.session)
        .set({ activeOrganizationId: organization.id, activeTeamId })
        .where(eq(authSchema.session.id, session.id));
      return cookies;
    };

    const outDir = path.join(root, ".bos", "scratch", "node-ops-484");
    fs.mkdirSync(outDir, { recursive: true });
    const cookies = {
      ops: await login(opsUser.id, operations.id),
      plain: await login(plainUser.id),
    };
    fs.writeFileSync(path.join(outDir, "ops-cookies.json"), JSON.stringify(cookies.ops, null, 2));
    fs.writeFileSync(
      path.join(outDir, "plain-cookies.json"),
      JSON.stringify(cookies.plain, null, 2),
    );

    const summary = {
      mode,
      nearAccount,
      userId: user.id,
      platformRole: mode === "owner" ? "admin" : "user",
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      orgRole,
      teams: {
        operations: {
          id: operations.id,
          areas: ["node-operations"],
          member: mode === "ops",
        },
        community: { id: community.id, areas: ["events"], member: false },
      },
      tenantId: harbor.tenant.id,
      nodeId: harbor.node.id,
      nodeSlug: harbor.node.slug,
      hostname: harbor.hostname,
      validatorAccountId: validator.account_id,
      bulletin,
      urls: {
        settings: `http://localhost:3000/tenant/${harbor.tenant.id}`,
        content: `http://localhost:3000/nodes/${harbor.node.id}/content`,
        dashboardNode: `http://localhost:3000/dashboard/node?nodeId=${harbor.node.id}`,
      },
      helperCookies: {
        ops: path.join(outDir, "ops-cookies.json"),
        plain: path.join(outDir, "plain-cookies.json"),
      },
    };
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log(
      `\nSwitched ${nearAccount} to --as ${mode}. Sign out/in (or refresh) if the UI still shows the old role.`,
    );
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import * as authSchema from "../../../../plugins/auth/src/db/schema.ts";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedNode, seedTenant } from "../../lib/seed-tenant.mjs";

const HOUR = 3_600_000;

type Cookie = Awaited<
  ReturnType<Awaited<ReturnType<typeof createAuthTestInstance>>["test"]["login"]>
>["cookies"][number];

export interface EventStationCommunity {
  nodeId: string;
  eventId: string;
  eventTitle: string;
  cookies: { owner: Cookie[]; member: Cookie[]; platformAdmin: Cookie[] };
}

async function seedEvent(nodeId: string, title: string) {
  const url = computeRegressionEnv().dbUrls.API_DATABASE_URL;
  if (!url) throw new Error("API_DATABASE_URL is not configured for this workspace");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const located = await client.query(
      "SELECT table_schema FROM information_schema.tables WHERE table_name = 'discovery_activities' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema LIMIT 1",
    );
    const schema = located.rows[0]?.table_schema;
    if (!schema) throw new Error("discovery_activities table not found — did API migrations run?");
    await client.query(`SET search_path TO "${schema}", public`);
    const id = randomUUID();
    const canonicalUrl = `https://example.com/regression-events/${id}`;
    const now = Date.now();
    const data = {
      id,
      ownerNodeId: nodeId,
      nodeIds: [nodeId],
      kind: "event",
      title,
      summary: "Regression fixture event",
      url: canonicalUrl,
      source: "Regression",
      publishedAt: new Date(now).toISOString(),
      startsAt: new Date(now + 24 * HOUR).toISOString(),
      endsAt: new Date(now + 27 * HOUR).toISOString(),
      timezone: "UTC",
      venue: "Regression Hall",
      status: "published",
    };
    await client.query(
      "INSERT INTO discovery_activities (id, owner_node_id, canonical_url, data) VALUES ($1, $2, $3, $4::jsonb)",
      [id, nodeId, canonicalUrl, JSON.stringify(data)],
    );
    return id;
  } finally {
    await client.end();
  }
}

export async function seedEventStationCommunity(): Promise<EventStationCommunity> {
  const regressionEnv = computeRegressionEnv();
  const { test, db, close } = await createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
  try {
    const unique = randomUUID().slice(0, 8);
    const saveUser = (label: string, role?: string) =>
      test.saveUser(
        test.createUser({
          email: `regression-station-${label}-${unique}@citynode.test`,
          name: `Regression ${label}`,
          emailVerified: true,
          ...(role ? { role } : {}),
        }),
      );
    const owner = await saveUser("owner");
    const member = await saveUser("member");
    const platformAdmin = await saveUser("platform-admin", "admin");
    const slug = `regression-station-${unique}`;
    const organization = await test.saveOrganization(test.createOrganization({ name: slug, slug }));
    await test.addMember({ userId: owner.id, organizationId: organization.id, role: "owner" });
    await test.addMember({ userId: member.id, organizationId: organization.id, role: "member" });

    const login = async (userId: string) => {
      const { session, cookies } = await test.login({ userId });
      await db
        .update(authSchema.session)
        .set({ activeOrganizationId: organization.id })
        .where(eq(authSchema.session.id, session.id));
      return cookies;
    };

    const tenant = await seedTenant({
      subdomain: slug,
      name: `Station ${unique}`,
      accountId: `${slug}.testnet`,
      orgId: organization.id,
    });
    const node = await seedNode({ tenantId: tenant.id, slug, name: `Station City ${unique}` });
    const eventTitle = `Regression Station Night ${unique}`;
    const eventId = await seedEvent(node.id, eventTitle);

    return {
      nodeId: node.id,
      eventId,
      eventTitle,
      cookies: {
        owner: await login(owner.id),
        member: await login(member.id),
        platformAdmin: await login(platformAdmin.id),
      },
    };
  } finally {
    await close();
  }
}

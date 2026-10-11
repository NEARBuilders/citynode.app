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

export interface OrganizerCommunity {
  organizationSlug: string;
  nodeId: string;
  eventId: string;
  eventTitle: string;
  cookies: {
    owner: Cookie[];
    organizer: Cookie[];
    organizerWithTeamActive: Cookie[];
    member: Cookie[];
  };
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
    const url = `https://example.com/regression-events/${id}`;
    const now = Date.now();
    const data = {
      id,
      ownerNodeId: nodeId,
      nodeIds: [nodeId],
      kind: "event",
      title,
      summary: "Regression fixture event",
      url,
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
      [id, nodeId, url, JSON.stringify(data)],
    );
    return id;
  } finally {
    await client.end();
  }
}

export async function seedOrganizerCommunity(): Promise<OrganizerCommunity> {
  const regressionEnv = computeRegressionEnv();
  const { test, db, close } = await createAuthTestInstance({
    authDatabaseUrl: regressionEnv.dbUrls.AUTH_DATABASE_URL ?? "",
    secret: regressionEnv.authSecret,
  });
  try {
    const unique = randomUUID().slice(0, 8);
    const saveUser = (role: string) =>
      test.saveUser(
        test.createUser({
          email: `regression-${role}-${unique}@citynode.test`,
          name: `Regression ${role}`,
          emailVerified: true,
        }),
      );
    const owner = await saveUser("owner");
    const organizer = await saveUser("organizer");
    const member = await saveUser("member");
    const organizationSlug = `regression-organizers-${unique}`;
    const organization = await test.saveOrganization(
      test.createOrganization({ name: organizationSlug, slug: organizationSlug }),
    );
    await test.addMember({ userId: owner.id, organizationId: organization.id, role: "owner" });
    await test.addMember({ userId: organizer.id, organizationId: organization.id, role: "member" });
    await test.addMember({ userId: member.id, organizationId: organization.id, role: "member" });

    const now = new Date();
    const team = async (name: string, areas: string[], userId: string) => {
      const [row] = await db
        .insert(authSchema.team)
        .values({
          id: randomUUID(),
          name,
          organizationId: organization.id,
          metadata: JSON.stringify({ areas }),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await db
        .insert(authSchema.teamMember)
        .values({ id: randomUUID(), teamId: row!.id, userId, createdAt: now });
      return row!.id;
    };
    const communityTeam = await team("Community", ["events"], organizer.id);
    await team("Treasury", ["finance", "stake"], member.id);

    const login = async (userId: string, activeTeamId: string | null = null) => {
      const { session, cookies } = await test.login({ userId });
      await db
        .update(authSchema.session)
        .set({ activeOrganizationId: organization.id, activeTeamId })
        .where(eq(authSchema.session.id, session.id));
      return cookies;
    };

    const subdomain = `regression-organizers-${unique}`;
    const tenant = await seedTenant({
      subdomain,
      name: `Organizers ${unique}`,
      accountId: `${subdomain}.testnet`,
      orgId: organization.id,
    });
    const node = await seedNode({
      tenantId: tenant.id,
      slug: subdomain,
      name: `Organizer City ${unique}`,
    });
    const eventTitle = `Regression Meetup ${unique}`;
    const eventId = await seedEvent(node.id, eventTitle);

    return {
      organizationSlug,
      nodeId: node.id,
      eventId,
      eventTitle,
      cookies: {
        owner: await login(owner.id),
        organizer: await login(organizer.id),
        organizerWithTeamActive: await login(organizer.id, communityTeam),
        member: await login(member.id),
      },
    };
  } finally {
    await close();
  }
}

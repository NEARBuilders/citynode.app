import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as authSchema from "../../../../plugins/auth/src/db/schema.ts";
import { createAuthTestInstance } from "../../lib/auth-test-instance.ts";
import { computeRegressionEnv } from "../../lib/regression-env.mjs";
import { seedDiscoveryEvent, seedNode, seedTenant } from "../../lib/seed-tenant.mjs";

type Cookie = Awaited<
  ReturnType<Awaited<ReturnType<typeof createAuthTestInstance>>["test"]["login"]>
>["cookies"][number];

export interface EventStationCommunity {
  nodeId: string;
  eventId: string;
  eventTitle: string;
  cookies: { owner: Cookie[]; platformAdmin: Cookie[]; otherOrganizer: Cookie[] };
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
    const saveOrganization = (slug: string) =>
      test.saveOrganization(test.createOrganization({ name: slug, slug }));
    const owner = await saveUser("owner");
    const platformAdmin = await saveUser("platform-admin", "admin");
    const otherOrganizer = await saveUser("other-organizer", "admin");
    const slug = `regression-station-${unique}`;
    const organization = await saveOrganization(slug);
    const otherOrganization = await saveOrganization(`regression-station-other-${unique}`);
    await test.addMember({ userId: owner.id, organizationId: organization.id, role: "owner" });
    await test.addMember({
      userId: otherOrganizer.id,
      organizationId: otherOrganization.id,
      role: "owner",
    });

    const login = async (userId: string, activeOrganizationId: string) => {
      const { session, cookies } = await test.login({ userId });
      await db
        .update(authSchema.session)
        .set({ activeOrganizationId })
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
    const event = await seedDiscoveryEvent({ nodeId: node.id, title: eventTitle });

    return {
      nodeId: node.id,
      eventId: event.id,
      eventTitle,
      cookies: {
        owner: await login(owner.id, organization.id),
        platformAdmin: await login(platformAdmin.id, organization.id),
        otherOrganizer: await login(otherOrganizer.id, otherOrganization.id),
      },
    };
  } finally {
    await close();
  }
}

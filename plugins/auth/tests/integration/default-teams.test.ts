import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { DEFAULT_TEAMS } from "../../src/default-teams";
import { parseTeamAreas } from "../../src/utils";
import { createTestOrg, createTestServices, createTestUser } from "../helpers";

let setup: Awaited<ReturnType<typeof createTestServices>>;
beforeAll(async () => {
  setup = await createTestServices();
}, 30000);
afterAll(async () => {
  await setup.driver.close();
});

describe("default community teams", () => {
  it("provisions active orgs once and preserves custom areas, renames and deletions on reactivation", async () => {
    const owner = await createTestUser(setup.services);
    const org = await createTestOrg(setup.services, owner.userId);
    await setup.services.db.insert(schema.team).values({
      id: "custom-operations",
      name: "Operations",
      organizationId: org.id,
      metadata: '{"areas":["events"]}',
    });
    const activate = () =>
      setup.services.auth.api.setActiveOrganization({
        headers: owner.headers,
        body: { organizationId: org.id },
      });
    await activate();
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, org.id),
    });
    expect(teams).toHaveLength(3);
    expect(teams.find((team) => team.id === "custom-operations")?.metadata).toBe(
      '{"areas":["events"]}',
    );
    const treasury = teams.find((team) => team.name === "Treasury")!;
    await setup.services.db
      .update(schema.team)
      .set({ name: "Custom treasury", metadata: '{"areas":["stake"]}' })
      .where(eq(schema.team.id, treasury.id));
    await setup.services.db
      .delete(schema.team)
      .where(eq(schema.team.id, teams.find((team) => team.name === "Community")!.id));
    await activate();
    expect(
      await setup.services.db.query.team.findMany({
        where: eq(schema.team.organizationId, org.id),
      }),
    ).toHaveLength(2);
    expect(
      await setup.services.db.query.team.findFirst({ where: eq(schema.team.id, treasury.id) }),
    ).toMatchObject({ name: "Custom treasury", metadata: '{"areas":["stake"]}' });
  });

  it("backfills existing active orgs with the migration, excluding personal, pending and rejected orgs", async () => {
    const owner = await createTestUser(setup.services);
    const active = await createTestOrg(setup.services, owner.userId);
    const pending = await createTestOrg(setup.services, owner.userId);
    const rejected = await createTestOrg(setup.services, owner.userId);
    await setup.services.db
      .update(schema.organization)
      .set({ status: "pending" })
      .where(eq(schema.organization.id, pending.id));
    await setup.services.db
      .update(schema.organization)
      .set({ status: "rejected" })
      .where(eq(schema.organization.id, rejected.id));
    await setup.services.db.insert(schema.team).values({
      id: "existing-treasury",
      name: "Treasury",
      organizationId: active.id,
      metadata: '{"areas":["stake"]}',
    });
    await setup.services.db.execute(
      sql.raw('ALTER TABLE "organization" DROP COLUMN "default_teams_provisioned_at"'),
    );
    const migration = readFileSync(
      new URL("../../src/db/migrations/0011_default-community-teams.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await setup.services.db.execute(sql.raw(statement));
    const teams = await setup.services.db.query.team.findMany({
      where: eq(schema.team.organizationId, active.id),
    });
    expect(teams).toHaveLength(3);
    expect(teams.find((team) => team.id === "existing-treasury")?.metadata).toBe(
      '{"areas":["stake"]}',
    );
    for (const team of DEFAULT_TEAMS.filter((team) => team.name !== "Treasury")) {
      expect(parseTeamAreas(teams.find((stored) => stored.name === team.name)?.metadata)).toEqual([
        ...team.areas,
      ]);
    }
    for (const orgId of [owner.personalOrgId, pending.id, rejected.id]) {
      expect(
        await setup.services.db.query.team.findMany({
          where: eq(schema.team.organizationId, orgId),
        }),
      ).toHaveLength(0);
      expect(
        (
          await setup.services.db.query.organization.findFirst({
            where: eq(schema.organization.id, orgId),
          })
        )?.defaultTeamsProvisionedAt,
      ).toBeNull();
    }
    expect(
      (
        await setup.services.db.query.organization.findFirst({
          where: eq(schema.organization.id, active.id),
        })
      )?.defaultTeamsProvisionedAt,
    ).toBeInstanceOf(Date);
  });
});

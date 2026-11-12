import { rmSync } from "node:fs";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";
import { places as placesTable } from "@/db/schema";
import pluginDevConfig from "../../plugin.dev";
import { authedContext, getPluginClient, orgContext, teardown } from "../setup";

const databaseDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "official-application-"));
  process.env.API_TEST_DATABASE_URL = `pglite:${dir}`;
  process.env.API_DATABASE_URL = `pglite:${dir}`;
  return dir;
});

const savedAt = "2026-11-11T00:00:00.000Z";

type FakeProposal = {
  id: string;
  pluginId: string;
  entityId: string;
  createdBy: string;
  reviewStatus: string;
  applyStatus: string;
  appliedResourceId: string | null;
  updatedAt: string;
  payload: Record<string, unknown>;
};

const proposals = new Map<string, FakeProposal>();
const orgs = new Map<
  string,
  { metadata: Record<string, unknown>; members: Set<string>; roles: Map<string, string> }
>();
const calls = {
  linkDao: [] as unknown[],
  addMember: [] as unknown[],
  updateMemberRole: [] as unknown[],
};

function application(slug: string, extra: Record<string, unknown> = {}): FakeProposal {
  return {
    id: `prop-${slug}`,
    pluginId: "node",
    entityId: slug,
    createdBy: "applicant.testnet",
    reviewStatus: "pending",
    applyStatus: "not_started",
    appliedResourceId: null,
    updatedAt: savedAt,
    payload: {
      name: slug,
      slug,
      motivation: "Serve the local community",
      accountId: `${slug}-test.sputnik-dao.testnet`,
      submitterAccountId: "applicant.testnet",
      ...extra,
    },
  };
}

const forbidden = () => new ORPCError("FORBIDDEN", { message: "Not a member" });

function authStub(context: { userId?: string }) {
  const userId = context.userId ?? "anonymous";
  const org = (organizationId: string) => {
    const found = orgs.get(organizationId);
    if (!found) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
    return found;
  };
  return {
    createOrganization: async (input: { name: string; slug: string }) => {
      const id = `org-${input.slug}`;
      if (!orgs.has(id)) {
        orgs.set(id, {
          metadata: {},
          members: new Set([userId]),
          roles: new Map([[userId, "owner"]]),
        });
      }
      return { id, name: input.name, slug: input.slug };
    },
    createOnboardingCode: async (input: { organizationId: string }) => ({
      code: `join-${input.organizationId}`,
    }),
    addMember: async (input: { userId: string; role: string; organizationId: string }) => {
      calls.addMember.push(input);
      org(input.organizationId).members.add(input.userId);
      org(input.organizationId).roles.set(input.userId, input.role);
      return { id: `member-${input.userId}`, ...input };
    },
    listMembers: async ({ organizationId }: { organizationId: string }) => {
      const found = org(organizationId);
      if (!found.members.has(userId)) throw forbidden();
      return {
        members: [...found.members].map((memberId) => ({
          id: `member-${memberId}`,
          userId: memberId,
          role: found.roles.get(memberId) ?? "member",
        })),
      };
    },
    updateMemberRole: async (input: { memberId: string; role: string; organizationId: string }) => {
      calls.updateMemberRole.push(input);
      org(input.organizationId).roles.set(input.memberId.replace(/^member-/, ""), input.role);
      return { success: true };
    },
    getDao: async ({ organizationId }: { organizationId: string }) => {
      const found = org(organizationId);
      if (!found.members.has(userId)) throw forbidden();
      return {
        daoAccountId: (found.metadata.daoAccountId as string | undefined) ?? null,
        daoNetwork: (found.metadata.daoNetwork as "mainnet" | "testnet" | undefined) ?? null,
      };
    },
    linkDao: async (input: {
      organizationId: string;
      daoAccountId: string;
      daoNetwork?: string;
    }) => {
      calls.linkDao.push(input);
      const found = org(input.organizationId);
      if (!["owner", "admin"].includes(found.roles.get(userId) ?? "")) throw forbidden();
      found.metadata = {
        ...found.metadata,
        daoAccountId: input.daoAccountId,
        daoNetwork: input.daoNetwork ?? "mainnet",
      };
      return { success: true };
    },
  };
}

function proposalsStub(context: { user?: { role?: string | null } }) {
  const requireAdmin = () => {
    if (context.user?.role !== "admin") {
      throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    }
  };
  const bump = (proposal: FakeProposal, patch: Partial<FakeProposal>) => {
    Object.assign(proposal, patch, {
      updatedAt: new Date(Date.parse(proposal.updatedAt) + 1000).toISOString(),
    });
    return { data: { ...proposal } };
  };
  const find = (entityId: string, expectedUpdatedAt: string) => {
    const proposal = proposals.get(entityId);
    if (!proposal) throw new ORPCError("NOT_FOUND", { message: "Proposal not found" });
    if (proposal.updatedAt !== expectedUpdatedAt) {
      throw new ORPCError("BAD_REQUEST", { message: "stale" });
    }
    return proposal;
  };
  return {
    getProposals: async ({ entityId }: { entityId: string }) => ({
      data: proposals.has(entityId) ? [{ ...proposals.get(entityId)! }] : [],
    }),
    approve: async (input: { entityId: string; expectedUpdatedAt: string }) => {
      requireAdmin();
      return bump(find(input.entityId, input.expectedUpdatedAt), {
        reviewStatus: "approved",
        applyStatus: "applying",
      });
    },
    markApplied: async (input: {
      entityId: string;
      expectedUpdatedAt: string;
      appliedResourceId?: string;
    }) => {
      requireAdmin();
      return bump(find(input.entityId, input.expectedUpdatedAt), {
        applyStatus: "applied",
        appliedResourceId: input.appliedResourceId ?? null,
      });
    },
  };
}

let driver: Awaited<ReturnType<typeof createDatabaseDriver>>;
const schemaName = `plugin_${pluginMigrationSlug(pluginDevConfig.pluginId)}`;

async function withDb<T>(
  run: (db: Awaited<ReturnType<typeof createDatabaseDriver>>["db"]) => Promise<T>,
) {
  driver = await createDatabaseDriver(`pglite:${databaseDir}`, schemaName);
  try {
    return await run(driver.db);
  } finally {
    await driver.close();
  }
}

async function communityNodeId(place: string) {
  const visitor = await getPluginClient();
  return (await visitor.resolvePlace({ place }))?.community?.nodeId ?? null;
}

beforeAll(async () => {
  const slug = pluginMigrationSlug(pluginDevConfig.pluginId);
  await withDb(async (db) => {
    const { migrations } = await Effect.runPromise(loadMigrations);
    await Effect.runPromise(migrate(db, migrations, getMigrationStorage(slug), schemaName));
    await db.insert(placesTable).values([
      { slug: "lagos", name: "Lagos", label: "city" },
      { slug: "abuja", name: "Abuja", label: "city" },
      { slug: "kano", name: "Kano", label: "city" },
      { slug: "ibadan", name: "Ibadan", label: "city" },
      { slug: "enugu", name: "Enugu", label: "city" },
    ]);
  });
  await getPluginClient(undefined, {
    auth: { client: authStub, router: {} },
    proposals: { client: proposalsStub, router: {} },
  } as never);
  const activator = await getPluginClient(authedContext("activator"));
  for (const place of ["lagos", "abuja", "ibadan", "enugu"]) {
    await activator.activateCommunity({ place });
  }
}, 30_000);

afterAll(async () => {
  await teardown();
  rmSync(databaseDir, { recursive: true, force: true });
});

beforeEach(() => {
  calls.linkDao.length = 0;
  calls.addMember.length = 0;
  calls.updateMemberRole.length = 0;
});

describe("Official Application approval", () => {
  it("links the applicant's DAO to the activated community and adds the reviewer as admin", async () => {
    proposals.set("lagos", application("lagos"));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    const result = await admin.approveOfficialApplication({
      proposalId: "prop-lagos",
      entityId: "lagos",
      expectedUpdatedAt: savedAt,
    });

    expect(result).toMatchObject({
      organizationId: "org-lagos",
      daoAccountId: "lagos-test.sputnik-dao.testnet",
      network: "testnet",
    });
    expect(calls.addMember).toEqual([
      { userId: "reviewer", role: "admin", organizationId: "org-lagos" },
    ]);
    expect(orgs.get("org-lagos")?.metadata).toMatchObject({
      daoAccountId: "lagos-test.sputnik-dao.testnet",
      daoNetwork: "testnet",
    });
    expect(proposals.get("lagos")).toMatchObject({
      reviewStatus: "approved",
      applyStatus: "applied",
      appliedResourceId: result.nodeId,
    });

    const visitor = await getPluginClient();
    expect(await visitor.getNodeDao({ nodeId: result.nodeId })).toEqual({
      daoAccountId: "lagos-test.sputnik-dao.testnet",
      network: "testnet",
    });
  });

  it("makes a reviewer who joined as a plain member an admin before linking", async () => {
    orgs.get("org-enugu")?.members.add("member-reviewer");
    orgs.get("org-enugu")?.roles.set("member-reviewer", "member");
    proposals.set("enugu", application("enugu"));
    const admin = await getPluginClient(authedContext("member-reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-enugu",
      entityId: "enugu",
      expectedUpdatedAt: savedAt,
    });

    expect(calls.addMember).toEqual([]);
    expect(calls.updateMemberRole).toEqual([
      { memberId: "member-member-reviewer", role: "admin", organizationId: "org-enugu" },
    ]);
    expect(orgs.get("org-enugu")?.metadata.daoAccountId).toBe("enugu-test.sputnik-dao.testnet");
  });

  it("refuses to approve for a place that has no community yet and changes nothing", async () => {
    proposals.set("kano", application("kano"));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-kano",
        entityId: "kano",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(calls.linkDao).toEqual([]);
    expect(proposals.get("kano")?.reviewStatus).toBe("pending");
    expect(await communityNodeId("kano")).toBeNull();
  });

  it("refuses to replace a DAO another application already linked", async () => {
    proposals.set("lagos", { ...application("lagos"), id: "prop-lagos-2" });
    proposals.get("lagos")!.payload.accountId = "rival-test.sputnik-dao.testnet";
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-lagos-2",
        entityId: "lagos",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow(/already linked/);
    expect(orgs.get("org-lagos")?.metadata.daoAccountId).toBe("lagos-test.sputnik-dao.testnet");
    expect(proposals.get("lagos")?.reviewStatus).toBe("pending");
  });

  it("finishes a legacy application that was approved but never finished setting up", async () => {
    proposals.set("abuja", {
      ...application("abuja", { kind: "city", parentId: null, orgId: "legacy-org" }),
      reviewStatus: "approved",
      applyStatus: "failed",
    });
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-abuja",
      entityId: "abuja",
      expectedUpdatedAt: savedAt,
    });

    expect(proposals.get("abuja")).toMatchObject({
      reviewStatus: "approved",
      applyStatus: "applied",
    });
    expect(orgs.get("org-abuja")?.metadata.daoAccountId).toBe("abuja-test.sputnik-dao.testnet");
  });

  it("refuses stale, rejected and non-admin approvals", async () => {
    proposals.set("ibadan", { ...application("ibadan"), reviewStatus: "rejected" });
    const admin = await getPluginClient(authedContext("reviewer", "admin"));
    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-ibadan",
        entityId: "ibadan",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow(/already decided/);

    proposals.set("ibadan", application("ibadan"));
    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-ibadan",
        entityId: "ibadan",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(/changed/);

    const member = await getPluginClient(authedContext("someone"));
    await expect(
      member.approveOfficialApplication({
        proposalId: "prop-ibadan",
        entityId: "ibadan",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow();
    expect(calls.linkDao).toEqual([]);
    expect(orgs.get("org-ibadan")?.metadata).toEqual({});
  });
});

describe("validator attach after approval", () => {
  it("lets the official community's own organization attach validators", async () => {
    const lagosNodeId = await communityNodeId("lagos");
    const ibadanNodeId = await communityNodeId("ibadan");
    const lagosAdmin = await getPluginClient(orgContext("activator", "org-lagos", "owner"));
    const ibadanAdmin = await getPluginClient(orgContext("activator", "org-ibadan", "owner"));

    const attempt = await lagosAdmin
      .createValidator({
        nodeId: lagosNodeId!,
        accountId: "pool.poolv1.near",
        network: "mainnet",
        protocol: "near",
        role: "official",
        isDefault: true,
      })
      .then(
        () => null,
        (error: Error) => error.message,
      );
    expect(attempt ?? "").not.toMatch(/once the community is official|platform admins/);
    await expect(
      ibadanAdmin.createValidator({
        nodeId: ibadanNodeId!,
        accountId: "pool.poolv1.near",
        network: "mainnet",
        protocol: "near",
        role: "official",
        isDefault: true,
      }),
    ).rejects.toThrow(/once the community is official/);
  });
});

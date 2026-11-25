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
  updatedAt: string;
  payload: Record<string, unknown>;
};

const proposals = new Map<string, FakeProposal>();
const failingApprovals = new Set<string>();
const orgs = new Map<
  string,
  { metadata: Record<string, unknown>; members: Set<string>; roles: Map<string, string> }
>();
const calls = {
  linkDao: [] as unknown[],
  adminAddMember: [] as unknown[],
  adminUpdateMemberRole: [] as unknown[],
  listMembers: [] as { organizationId: string; limit?: number; offset?: number }[],
};

function application(slug: string, extra: Record<string, unknown> = {}): FakeProposal {
  return {
    id: `prop-${slug}`,
    pluginId: "node",
    entityId: slug,
    createdBy: "applicant.testnet",
    reviewStatus: "pending",
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
    adminAddMember: async (input: { userId: string; role: string; organizationId: string }) => {
      calls.adminAddMember.push(input);
      if (org(input.organizationId).members.has(input.userId)) {
        throw new ORPCError("CONFLICT", { message: "Already a member" });
      }
      org(input.organizationId).members.add(input.userId);
      org(input.organizationId).roles.set(input.userId, input.role);
      return { id: `member-${input.userId}`, ...input };
    },
    listMembers: async (input: { organizationId: string; limit?: number; offset?: number }) => {
      calls.listMembers.push(input);
      const found = org(input.organizationId);
      if (!found.members.has(userId)) throw forbidden();
      const all = [...found.members].map((memberId) => ({
        id: `member-${memberId}`,
        userId: memberId,
        role: found.roles.get(memberId) ?? "member",
      }));
      const offset = input.offset ?? 0;
      return {
        members: all.slice(offset, offset + (input.limit ?? 100)),
        total: all.length,
      };
    },
    updateMemberRole: async () => {
      throw forbidden();
    },
    adminUpdateMemberRole: async (input: {
      userId: string;
      role: string;
      organizationId: string;
    }) => {
      calls.adminUpdateMemberRole.push(input);
      org(input.organizationId).roles.set(input.userId, input.role);
      return { id: `member-${input.userId}`, ...input };
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
      if (failingApprovals.has(input.entityId)) {
        throw new ORPCError("BAD_REQUEST", { message: "stale" });
      }
      return bump(find(input.entityId, input.expectedUpdatedAt), { reviewStatus: "approved" });
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
      { slug: "jos", name: "Jos", label: "city" },
      { slug: "kaduna", name: "Kaduna", label: "city" },
      { slug: "owerri", name: "Owerri", label: "city" },
      { slug: "calabar", name: "Calabar", label: "city" },
      { slug: "warri", name: "Warri", label: "city" },
      { slug: "benin-city", name: "Benin City", label: "city" },
    ]);
  });
  await getPluginClient(undefined, {
    auth: { client: authStub, router: {} },
    proposals: { client: proposalsStub, router: {} },
  } as never);
  const activator = await getPluginClient(authedContext("activator"));
  for (const place of [
    "lagos",
    "abuja",
    "ibadan",
    "enugu",
    "jos",
    "kaduna",
    "owerri",
    "calabar",
    "warri",
    "benin-city",
  ]) {
    await activator.activateCommunity({ place });
  }
}, 30_000);

afterAll(async () => {
  await teardown();
  rmSync(databaseDir, { recursive: true, force: true });
});

beforeEach(() => {
  calls.linkDao.length = 0;
  calls.adminAddMember.length = 0;
  calls.adminUpdateMemberRole.length = 0;
  calls.listMembers.length = 0;
});

async function placeIdOf(slug: string) {
  const visitor = await getPluginClient();
  const resolved = await visitor.resolvePlace({ place: slug });
  if (!resolved) throw new Error(`missing place ${slug}`);
  return resolved.place.id;
}

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
    expect(calls.adminAddMember).toEqual([
      { userId: "reviewer", role: "admin", organizationId: "org-lagos" },
    ]);
    expect(orgs.get("org-lagos")?.metadata).toMatchObject({
      daoAccountId: "lagos-test.sputnik-dao.testnet",
      daoNetwork: "testnet",
    });
    expect(proposals.get("lagos")).toMatchObject({ reviewStatus: "approved" });

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

    expect(calls.adminAddMember).toEqual([]);
    expect(calls.adminUpdateMemberRole).toEqual([
      { userId: "member-reviewer", role: "admin", organizationId: "org-enugu" },
    ]);
    expect(orgs.get("org-enugu")?.roles.get("member-reviewer")).toBe("admin");
    expect(orgs.get("org-enugu")?.metadata.daoAccountId).toBe("enugu-test.sputnik-dao.testnet");
  });

  it("finds a reviewer past the first page of a large community and stops paging there", async () => {
    const community = orgs.get("org-benin-city");
    for (let index = 0; index < 150; index += 1) community?.members.add(`attendee-${index}`);
    community?.members.add("late-reviewer");
    community?.roles.set("late-reviewer", "member");
    for (let index = 150; index < 250; index += 1) community?.members.add(`attendee-${index}`);
    proposals.set("benin-city", application("benin-city"));
    const admin = await getPluginClient(authedContext("late-reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-benin-city",
      entityId: "benin-city",
      expectedUpdatedAt: savedAt,
    });

    expect(calls.adminAddMember).toEqual([]);
    expect(calls.adminUpdateMemberRole).toEqual([
      { userId: "late-reviewer", role: "admin", organizationId: "org-benin-city" },
    ]);
    const pages = calls.listMembers.filter((call) => call.organizationId === "org-benin-city");
    expect(pages).toEqual([
      { organizationId: "org-benin-city", limit: 100, offset: 0 },
      { organizationId: "org-benin-city", limit: 100, offset: 100 },
    ]);
  });

  it("links the community of the application's own place when the payload names it", async () => {
    proposals.set("kaduna", application("kaduna", { placeId: await placeIdOf("kaduna") }));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    const result = await admin.approveOfficialApplication({
      proposalId: "prop-kaduna",
      entityId: "kaduna",
      expectedUpdatedAt: savedAt,
    });

    expect(result).toMatchObject({ organizationId: "org-kaduna" });
    expect(orgs.get("org-kaduna")?.metadata.daoAccountId).toBe("kaduna-test.sputnik-dao.testnet");
  });

  it("adds an applicant who isn't a member of the community as its admin", async () => {
    proposals.set("owerri", application("owerri", { applicantUserId: "applicant-user" }));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-owerri",
      entityId: "owerri",
      expectedUpdatedAt: savedAt,
    });

    expect(calls.adminAddMember).toContainEqual({
      userId: "applicant-user",
      role: "admin",
      organizationId: "org-owerri",
    });
    expect(orgs.get("org-owerri")?.roles.get("applicant-user")).toBe("admin");
  });

  it("doesn't make the applicant an admin when the approval itself fails", async () => {
    proposals.set("warri", application("warri", { applicantUserId: "raced-applicant" }));
    failingApprovals.add("warri");
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-warri",
        entityId: "warri",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow();

    expect(orgs.get("org-warri")?.members.has("raced-applicant")).toBe(false);
    expect(calls.adminAddMember).not.toContainEqual(
      expect.objectContaining({ userId: "raced-applicant" }),
    );
    expect(proposals.get("warri")?.reviewStatus).toBe("pending");
    failingApprovals.delete("warri");
  });

  it("leaves an applicant who already owns the community as its owner", async () => {
    proposals.set("calabar", application("calabar", { applicantUserId: "activator" }));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-calabar",
      entityId: "calabar",
      expectedUpdatedAt: savedAt,
    });

    expect(orgs.get("org-calabar")?.roles.get("activator")).toBe("owner");
    expect(calls.adminUpdateMemberRole).toEqual([]);
    expect(calls.adminAddMember).toEqual([
      { userId: "reviewer", role: "admin", organizationId: "org-calabar" },
    ]);
  });

  it("refuses an application whose placeId points at a different place than its slug", async () => {
    proposals.set("jos", application("jos", { placeId: await placeIdOf("lagos") }));
    const admin = await getPluginClient(authedContext("reviewer", "admin"));
    const lagosDao = orgs.get("org-lagos")?.metadata.daoAccountId;

    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-jos",
        entityId: "jos",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls.linkDao).toEqual([]);
    expect(orgs.get("org-lagos")?.metadata.daoAccountId).toBe(lagosDao);
    expect(orgs.get("org-jos")?.metadata.daoAccountId).toBeUndefined();
    expect(proposals.get("jos")?.reviewStatus).toBe("pending");
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
    const admin = await getPluginClient(authedContext("second-reviewer", "admin"));

    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-lagos-2",
        entityId: "lagos",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow(/already linked/);
    expect(calls.adminAddMember).toEqual([]);
    expect(orgs.get("org-lagos")?.members.has("second-reviewer")).toBe(false);
    expect(orgs.get("org-lagos")?.metadata.daoAccountId).toBe("lagos-test.sputnik-dao.testnet");
    expect(proposals.get("lagos")?.reviewStatus).toBe("pending");
  });

  it("approves a legacy application whose old setup never finished and was reopened", async () => {
    proposals.set(
      "abuja",
      application("abuja", { kind: "city", parentId: null, orgId: "legacy-org" }),
    );
    const admin = await getPluginClient(authedContext("reviewer", "admin"));

    await admin.approveOfficialApplication({
      proposalId: "prop-abuja",
      entityId: "abuja",
      expectedUpdatedAt: savedAt,
    });

    expect(proposals.get("abuja")?.reviewStatus).toBe("approved");
    expect(orgs.get("org-abuja")?.metadata.daoAccountId).toBe("abuja-test.sputnik-dao.testnet");
  });

  it("refuses stale, decided and non-admin approvals", async () => {
    proposals.set("ibadan", { ...application("ibadan"), reviewStatus: "rejected" });
    const admin = await getPluginClient(authedContext("reviewer", "admin"));
    await expect(
      admin.approveOfficialApplication({
        proposalId: "prop-ibadan",
        entityId: "ibadan",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toThrow(/already decided/);

    proposals.set("ibadan", { ...application("ibadan"), reviewStatus: "approved" });
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

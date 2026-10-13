import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authedContext, getPluginClient, teardown } from "../setup";

const provision = vi.fn(
  async ({ proposalId, legacyOrgId }: { proposalId: string; legacyOrgId?: string }) => ({
    id: legacyOrgId ?? `community-${proposalId}`,
  }),
);

const proposals = new Map<string, Record<string, unknown>>();
const applicant = "community-applicant.near";

function savedProposal(
  id: string,
  slug: string,
  options?: { orgId?: string; createdBy?: string; submitterAccountId?: string; status?: string },
) {
  return {
    id,
    pluginId: "node",
    entityId: slug,
    createdBy: options?.createdBy ?? applicant,
    reviewStatus: options?.status ?? "approved",
    payload: {
      kind: "country",
      parentId: null,
      name: slug === "chicago" ? "Chicago" : "Boston",
      slug,
      motivation: "Serve the local community",
      accountId: `${slug}.sputnik-dao.near`,
      submitterAccountId: options?.submitterAccountId ?? applicant,
      applicantUserId: "user-applicant",
      ...(options?.orgId ? { orgId: options.orgId } : {}),
    },
  };
}

describe("approved community proposal provisioning", () => {
  beforeAll(async () => {
    proposals.set("chicago", savedProposal("prop-chicago", "chicago"));
    await getPluginClient(undefined, {
      proposals: {
        client: (context?: { user?: { role?: string | null } }) => ({
          getProposals: async ({ entityId }: { entityId: string }) => ({
            data: proposals.has(entityId)
              ? [
                  context?.user?.role === "admin"
                    ? proposals.get(entityId)
                    : { ...proposals.get(entityId), payload: null },
                ]
              : [],
          }),
        }),
        router: {},
      },
      auth: {
        client: (context?: { user?: { role?: string | null } }) => ({
          provisionCommunityOrganization: async (input: Parameters<typeof provision>[0]) => {
            if (context?.user?.role !== "admin") throw new Error("Reviewer context missing");
            return provision(input);
          },
        }),
        router: {},
      },
    } as never);
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  it("uses the approved proposal identity and creates one linked tenant and node", async () => {
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-chicago",
      entityId: "chicago",
      hostname: "chicago.citynode.app",
    };
    const first = await admin.applyCommunityProposal(input);
    expect(provision).toHaveBeenCalledWith({
      proposalId: "prop-chicago",
      name: "Chicago",
      slug: "chicago",
      proposerAccountId: applicant,
      proposerUserId: "user-applicant",
    });
    const node = await admin.getNode({ nodeId: first.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant).toMatchObject({
      orgId: "community-prop-chicago",
      accountId: "chicago.sputnik-dao.near",
    });
    const second = await admin.applyCommunityProposal(input);
    expect(second.nodeId).toBe(first.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "chicago.sputnik-dao.near"),
    ).toHaveLength(1);
  });

  it("rejects non-admin, pending, and tampered proposer requests before creating resources", async () => {
    const member = await getPluginClient(authedContext("ordinary-reviewer"));
    await expect(
      member.applyCommunityProposal({
        proposalId: "prop-chicago",
        entityId: "chicago",
        hostname: "chicago.citynode.app",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    proposals.set("pending", savedProposal("prop-pending", "pending", { status: "pending" }));
    proposals.set(
      "tampered",
      savedProposal("prop-tampered", "tampered", {
        createdBy: "other.near",
        submitterAccountId: applicant,
      }),
    );
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    for (const slug of ["pending", "tampered"]) {
      await expect(
        admin.applyCommunityProposal({
          proposalId: `prop-${slug}`,
          entityId: slug,
          hostname: `${slug}.citynode.app`,
        }),
      ).rejects.toBeTruthy();
    }
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "pending.sputnik-dao.near"),
    ).toBe(false);
  });

  it("preserves the legacy organization link", async () => {
    proposals.set("boston", savedProposal("prop-boston", "boston", { orgId: "legacy-org" }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const applied = await admin.applyCommunityProposal({
      proposalId: "prop-boston",
      entityId: "boston",
      hostname: "boston.citynode.app",
    });
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({ legacyOrgId: "legacy-org", proposerAccountId: applicant }),
    );
    const node = await admin.getNode({ nodeId: applied.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant?.orgId).toBe("legacy-org");
  });

  it("keeps a single resource set under concurrent apply calls", async () => {
    proposals.set("race", savedProposal("prop-race", "race"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-race",
      entityId: "race",
      hostname: "race.citynode.app",
    };
    const results = await Promise.all([
      admin.applyCommunityProposal(input),
      admin.applyCommunityProposal(input),
    ]);
    expect(results[0]?.nodeId).toBe(results[1]?.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "race.sputnik-dao.near"),
    ).toHaveLength(1);
  });
});

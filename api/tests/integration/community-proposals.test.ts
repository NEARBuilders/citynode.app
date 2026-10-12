import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authedContext, getPluginClient, teardown } from "../setup";

const provision = vi.fn(
  async ({ proposalId, legacyOrgId }: { proposalId: string; legacyOrgId?: string }) => ({
    id: legacyOrgId ?? `community-${proposalId}`,
  }),
);

type RecordedStep = { entityId: string; step: string; status: string; resourceId?: string };
const recordApplyStep = vi.fn(async (_input: RecordedStep) => ({}));

const proposals = new Map<string, Record<string, unknown>>();
const applicant = "community-applicant.near";

function savedProposal(
  id: string,
  slug: string,
  options?: {
    orgId?: string;
    createdBy?: string;
    submitterAccountId?: string;
    status?: string;
    applyStatus?: string;
  },
) {
  return {
    id,
    pluginId: "node",
    entityId: slug,
    createdBy: options?.createdBy ?? applicant,
    reviewStatus: options?.status ?? "approved",
    applyStatus: options?.applyStatus ?? "applying",
    payload: {
      kind: "country",
      parentId: null,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
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
          recordApplyStep: (input: RecordedStep) => recordApplyStep(input),
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
    expect(recordApplyStep.mock.calls.map(([call]) => call)).toEqual([
      expect.objectContaining({
        entityId: "chicago",
        step: "organization",
        status: "completed",
        resourceId: "community-prop-chicago",
      }),
      expect.objectContaining({
        entityId: "chicago",
        step: "community",
        status: "completed",
        resourceId: first.nodeId,
      }),
    ]);
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

  it("only applies an application that an approval or retry has claimed", async () => {
    proposals.set("idle", savedProposal("prop-idle", "idle", { applyStatus: "failed" }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    await expect(
      admin.applyCommunityProposal({
        proposalId: "prop-idle",
        entityId: "idle",
        hostname: "idle.citynode.app",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "idle.sputnik-dao.near"),
    ).toBe(false);
  });

  it("resumes after organization provisioning fails", async () => {
    proposals.set("denver", savedProposal("prop-denver", "denver"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-denver",
      entityId: "denver",
      hostname: "denver.citynode.app",
    };
    recordApplyStep.mockClear();
    provision.mockRejectedValueOnce(new Error("auth unavailable"));
    await expect(admin.applyCommunityProposal(input)).rejects.toBeTruthy();
    expect(recordApplyStep).not.toHaveBeenCalled();
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "denver.sputnik-dao.near"),
    ).toBe(false);

    const resumed = await admin.applyCommunityProposal(input);
    expect(recordApplyStep.mock.calls.map(([call]) => call.step)).toEqual([
      "organization",
      "community",
    ]);
    expect(await admin.getNode({ nodeId: resumed.nodeId })).toMatchObject({ slug: "denver" });
  });

  it("reuses created resources when recording progress fails after they exist", async () => {
    proposals.set("austin", savedProposal("prop-austin", "austin"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-austin",
      entityId: "austin",
      hostname: "austin.citynode.app",
    };
    recordApplyStep.mockClear();
    recordApplyStep.mockImplementation(async (call) => {
      if (call.step === "community") throw new Error("proposals unavailable");
      return {};
    });
    try {
      await expect(admin.applyCommunityProposal(input)).rejects.toBeTruthy();
    } finally {
      recordApplyStep.mockImplementation(async () => ({}));
    }
    const created = (await admin.listTenants()).filter(
      (item) => item.accountId === "austin.sputnik-dao.near",
    );
    expect(created).toHaveLength(1);

    recordApplyStep.mockClear();
    const resumed = await admin.applyCommunityProposal(input);
    const node = await admin.getNode({ nodeId: resumed.nodeId });
    expect(node?.tenantId).toBe(created[0]?.id);
    expect(recordApplyStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ step: "community", resourceId: resumed.nodeId }),
    );
  });

  it("resumes after the community was renamed and its metadata replaced", async () => {
    proposals.set("seattle", savedProposal("prop-seattle", "seattle"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-seattle",
      entityId: "seattle",
      hostname: "seattle.citynode.app",
    };
    const first = await admin.applyCommunityProposal(input);
    await admin.updateNode({
      nodeId: first.nodeId,
      name: "Emerald City",
      slug: "emerald-city",
      metadata: { kind: "country" },
    });

    const resumed = await admin.applyCommunityProposal(input);
    expect(resumed.nodeId).toBe(first.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "seattle.sputnik-dao.near"),
    ).toHaveLength(1);
  });
});

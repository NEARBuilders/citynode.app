import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { AppActionError } from "@/i18n/error-message";
import { approveProposal, rejectProposal } from "./-proposal-application";

function proposal(pluginId: string) {
  return {
    id: "proposal-id",
    pluginId,
    entityId: pluginId === "node" ? "chicago" : "entity-id",
    payload: {
      placeId: "22222222-2222-4222-8222-222222222222",
      name: "Chicago",
      slug: "chicago",
      motivation: "Serve the local community.",
      accountId: "chicago.sputnik-dao.near",
      submitterAccountId: "applicant.near",
    },
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function client() {
  const decided = { ...proposal("node"), reviewStatus: "approved", applyStatus: "applied" };
  return {
    approveOfficialApplication: vi.fn().mockResolvedValue({
      nodeId: "node-id",
      organizationId: "org-id",
      daoAccountId: "chicago.sputnik-dao.near",
      network: "mainnet",
    }),
    proposals: {
      approve: vi
        .fn()
        .mockResolvedValue({ data: { ...proposal("other"), reviewStatus: "approved" } }),
      reject: vi
        .fn()
        .mockResolvedValue({ data: { ...proposal("node"), reviewStatus: "rejected" } }),
      getProposals: vi.fn().mockResolvedValue({ data: [decided] }),
    },
  };
}

describe("approving an Official Application", () => {
  it("links the DAO through the API and returns the decided application", async () => {
    const apiClient = client();
    const result = await approveProposal({
      apiClient: apiClient as unknown as ApiClient,
      proposal: proposal("node"),
    });
    expect(apiClient.approveOfficialApplication).toHaveBeenCalledWith({
      proposalId: "proposal-id",
      entityId: "chicago",
      expectedUpdatedAt: "2026-09-03T00:00:00.000Z",
    });
    expect(apiClient.proposals.approve).not.toHaveBeenCalled();
    expect(result.applyStatus).toBe("applied");
  });

  it("names a DAO conflict instead of a raw error", async () => {
    const apiClient = client();
    apiClient.approveOfficialApplication.mockRejectedValue(
      Object.assign(new Error("linked"), { code: "CONFLICT" }),
    );
    const result = approveProposal({
      apiClient: apiClient as unknown as ApiClient,
      proposal: proposal("node"),
    });
    await expect(result).rejects.toBeInstanceOf(AppActionError);
    await expect(result).rejects.toMatchObject({ messageId: "proposal.daoConflict" });
  });

  it("explains when the place has no community to link", async () => {
    const apiClient = client();
    apiClient.approveOfficialApplication.mockRejectedValue(
      Object.assign(new Error("no community"), { code: "PRECONDITION_FAILED", status: 412 }),
    );
    await expect(
      approveProposal({ apiClient: apiClient as unknown as ApiClient, proposal: proposal("node") }),
    ).rejects.toMatchObject({ messageId: "proposal.communityNotActivated" });
  });

  it("approves other plugins directly", async () => {
    const apiClient = client();
    await approveProposal({
      apiClient: apiClient as unknown as ApiClient,
      proposal: proposal("other"),
    });
    expect(apiClient.proposals.approve).toHaveBeenCalledWith({
      pluginId: "other",
      entityId: "entity-id",
      expectedUpdatedAt: "2026-09-03T00:00:00.000Z",
    });
    expect(apiClient.approveOfficialApplication).not.toHaveBeenCalled();
  });
});

describe("rejecting an Official Application", () => {
  it("only records the decision and touches no community resources", async () => {
    const apiClient = client();
    const result = await rejectProposal({
      apiClient: apiClient as unknown as ApiClient,
      proposal: proposal("node"),
      reason: "Not yet",
    });
    expect(apiClient.proposals.reject).toHaveBeenCalledWith({
      pluginId: "node",
      entityId: "chicago",
      expectedUpdatedAt: "2026-09-03T00:00:00.000Z",
      reason: "Not yet",
    });
    expect(apiClient.approveOfficialApplication).not.toHaveBeenCalled();
    expect(result.reviewStatus).toBe("rejected");
  });
});

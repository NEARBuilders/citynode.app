import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { approveAndApplyProposal } from "./-proposal-application";

function proposal(pluginId: string, payload: unknown = {}) {
  return {
    id: "proposal-id",
    pluginId,
    entityId: pluginId === "node" ? "chicago" : "entity-id",
    payload,
    reviewStatus: "pending" as const,
    applyStatus: "not_started" as const,
    operation: "create" as const,
    schemaVersion: "1",
    removeStatus: "not_started" as const,
    removeError: null,
    appliedResourceId: null,
    appliedAt: null,
    removedAt: null,
    applyError: null,
    rejectionReason: null,
    createdBy: "user-id",
    submissionCount: 1,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

function client(initialProposal = proposal("node", nodePayload)) {
  const approved = {
    ...initialProposal,
    reviewStatus: "approved" as const,
    updatedAt: "2026-09-03T00:01:00.000Z",
  };
  const applied = { ...approved, applyStatus: "applied" as const };
  return {
    proposals: {
      approve: vi.fn().mockResolvedValue({ data: approved }),
      markApplied: vi.fn().mockResolvedValue({ data: applied }),
      markApplyFailed: vi.fn().mockResolvedValue({
        data: { ...approved, applyStatus: "failed", applyError: "creation failed" },
      }),
    },
    applyCommunityProposal: vi.fn().mockResolvedValue({ nodeId: "node-id" }),
    registry: {
      getRegistryApp: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("Not found"), { code: "NOT_FOUND" })),
    },
  };
}

function publishedApp(domain: string, title = "Chicago") {
  return { data: { domain, resolvedConfig: { title } } };
}

const nodePayload = {
  kind: "city",
  parentId: "state-id",
  name: "Chicago",
  slug: "chicago",
  orgId: "org-id",
  motivation: "I want to operate a node for the local community.",
  accountId: "chicago.sputnik-dao.near",
  submitterAccountId: "applicant.near",
};

describe("proposal application dispatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies node proposals and finalizes them with the node ID", async () => {
    const api = client(proposal("node", nodePayload));
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);
    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(api.applyCommunityProposal).toHaveBeenCalledWith({
      proposalId: "proposal-id",
      entityId: "chicago",
      hostname: "chicago.citynode.app",
    });
    expect(api.proposals.markApplied).toHaveBeenCalledWith(
      expect.objectContaining({ appliedResourceId: "node-id" }),
    );
    expect(publishTenantConfig).toHaveBeenCalledWith({
      daoAccountId: "chicago.sputnik-dao.near",
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      hostname: "chicago.citynode.app",
      title: "Chicago",
    });
    expect(result.applyStatus).toBe("applied");
  });

  it("marks node application failures", async () => {
    const api = client(proposal("node", nodePayload));
    api.applyCommunityProposal.mockRejectedValue(new Error("creation failed"));
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig,
      }),
    ).rejects.toMatchObject({ messageId: "proposal.partiallyApplied" });
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "creation failed" }),
    );
  });

  it("shows a resource conflict after recording the failed apply", async () => {
    const api = client(proposal("node", nodePayload));
    api.applyCommunityProposal.mockRejectedValue(
      Object.assign(new Error("Slug in use"), { code: "CONFLICT" }),
    );

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig: vi.fn(),
      }),
    ).rejects.toMatchObject({ messageId: "proposal.resourceConflict" });
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Slug in use" }),
    );
  });

  it("keeps the review approved when DAO publication fails", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    const publishTenantConfig = vi.fn().mockRejectedValue(new Error("Trezu rejected the request"));

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });
    const assertion = expect(result).rejects.toMatchObject({
      messageId: "proposal.partiallyApplied",
    });
    await vi.runAllTimersAsync();
    await assertion;

    expect(api.proposals.approve).toHaveBeenCalledOnce();
    expect(api.applyCommunityProposal).toHaveBeenCalledOnce();
    expect(api.proposals.markApplied).not.toHaveBeenCalled();
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Trezu rejected the request" }),
    );
  });

  it("finalizes when the DAO reports a failed proposal but the config is indexed", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp
      .mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "NOT_FOUND" }))
      .mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn().mockRejectedValue(new Error("Proposal 0 was failed"));

    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(publishTenantConfig).toHaveBeenCalledOnce();
    expect(api.proposals.markApplyFailed).not.toHaveBeenCalled();
    expect(api.proposals.markApplied).toHaveBeenCalledWith(
      expect.objectContaining({ appliedResourceId: "node-id" }),
    );
    expect(result.applyStatus).toBe("applied");
  });

  it("does not publish again when the community config is already indexed", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn();

    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(api.registry.getRegistryApp).toHaveBeenCalledWith({
      accountId: "chicago.sputnik-dao.near",
      gatewayId: "citynode.app",
    });
    expect(publishTenantConfig).not.toHaveBeenCalled();
    expect(result.applyStatus).toBe("applied");
  });

  it("publishes when the indexed config belongs to another hostname", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockResolvedValue(publishedApp("old-name.citynode.app"));
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);

    await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(publishTenantConfig).toHaveBeenCalledOnce();
  });

  it("publishes when the indexed config has another title", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockResolvedValue(
      publishedApp("chicago.citynode.app", "Old Chicago"),
    );
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);

    await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(publishTenantConfig).toHaveBeenCalledOnce();
  });

  it("does not publish again when the registry cannot be read", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockRejectedValue(new Error("Registry unavailable"));
    const publishTenantConfig = vi.fn();

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig,
      }),
    ).rejects.toMatchObject({ messageId: "proposal.partiallyApplied" });

    expect(publishTenantConfig).not.toHaveBeenCalled();
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Registry unavailable" }),
    );
  });

  it("approves unsupported plugins without applying them", async () => {
    const unknownProposal = proposal("unknown");
    const api = client(unknownProposal);
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);
    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: unknownProposal,
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
    });

    expect(api.applyCommunityProposal).not.toHaveBeenCalled();
    expect(api.proposals.markApplied).not.toHaveBeenCalled();
    expect(result.reviewStatus).toBe("approved");
  });
});

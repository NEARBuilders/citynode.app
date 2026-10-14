import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { approveAndApplyProposal, keptResources, rejectProposal } from "./-proposal-application";

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
    applySteps: {},
    applyTimedOut: false,
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
      recordApplyStep: vi.fn().mockResolvedValue({ data: approved }),
    },
    applyCommunityProposal: vi.fn().mockResolvedValue({ nodeId: "node-id" }),
    registry: {
      getRegistryApp: vi
        .fn()
        .mockRejectedValueOnce(notFound())
        .mockResolvedValue(publishedApp("chicago.citynode.app")),
    },
  };
}

function notFound() {
  return Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
}

const noOpenProposal = () => Promise.resolve(null);

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
      findOpenTenantConfigProposal: noOpenProposal,
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
    expect(api.proposals.recordApplyStep).toHaveBeenCalledWith({
      pluginId: "node",
      entityId: "chicago",
      step: "publication",
      status: "completed",
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
        findOpenTenantConfigProposal: noOpenProposal,
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
        findOpenTenantConfigProposal: noOpenProposal,
      }),
    ).rejects.toMatchObject({ messageId: "proposal.resourceConflict" });
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Slug in use" }),
    );
  });

  it("keeps the review approved when DAO publication fails", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(notFound());
    const publishTenantConfig = vi.fn().mockRejectedValue(new Error("Trezu rejected the request"));

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
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
    const publishTenantConfig = vi.fn().mockRejectedValue(new Error("Proposal 0 was failed"));

    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
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
    api.registry.getRegistryApp.mockReset().mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn();

    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
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
    api.registry.getRegistryApp
      .mockReset()
      .mockResolvedValueOnce(publishedApp("old-name.citynode.app"))
      .mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);

    await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
    });

    expect(publishTenantConfig).toHaveBeenCalledOnce();
  });

  it("publishes when the indexed config has another title", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp
      .mockReset()
      .mockResolvedValueOnce(publishedApp("chicago.citynode.app", "Old Chicago"))
      .mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn().mockResolvedValue(undefined);

    await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
    });

    expect(publishTenantConfig).toHaveBeenCalledOnce();
  });

  it("does not publish again when the registry cannot be read", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(new Error("Registry unavailable"));
    const publishTenantConfig = vi.fn();

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig,
        findOpenTenantConfigProposal: noOpenProposal,
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
      findOpenTenantConfigProposal: noOpenProposal,
    });

    expect(api.applyCommunityProposal).not.toHaveBeenCalled();
    expect(api.proposals.markApplied).not.toHaveBeenCalled();
    expect(result.reviewStatus).toBe("approved");
  });

  it("waits for an open DAO settings proposal instead of proposing again", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(notFound());
    const publishTenantConfig = vi.fn();

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig,
        findOpenTenantConfigProposal: () => Promise.resolve({ id: 7 }),
      }),
    ).rejects.toMatchObject({ messageId: "proposal.publicationAwaitingVote", values: { id: 7 } });

    expect(publishTenantConfig).not.toHaveBeenCalled();
    expect(api.proposals.recordApplyStep).toHaveBeenCalledWith(
      expect.objectContaining({ step: "publication", status: "waiting", resourceId: "7" }),
    );
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("#7") }),
    );
    expect(api.proposals.markApplied).not.toHaveBeenCalled();
  });

  it("does not propose DAO settings when the DAO proposals cannot be read", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(notFound());
    const publishTenantConfig = vi.fn();

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig,
        findOpenTenantConfigProposal: () => Promise.reject(new Error("RPC unavailable")),
      }),
    ).rejects.toMatchObject({ messageId: "proposal.partiallyApplied" });

    expect(publishTenantConfig).not.toHaveBeenCalled();
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "RPC unavailable" }),
    );
  });

  it("records the DAO proposal that a failed publish left open", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(notFound());
    const findOpenTenantConfigProposal = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 3 });

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig: vi.fn().mockRejectedValue(new Error("Wallet closed")),
      findOpenTenantConfigProposal,
    });
    const assertion = expect(result).rejects.toMatchObject({
      messageId: "proposal.publicationAwaitingVote",
    });
    await vi.runAllTimersAsync();
    await assertion;

    expect(api.proposals.recordApplyStep).toHaveBeenCalledWith(
      expect.objectContaining({ step: "publication", status: "waiting", resourceId: "3" }),
    );
  });

  it("stops when a published config never appears in the registry", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockRejectedValue(notFound());

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig: vi.fn().mockResolvedValue(undefined),
      findOpenTenantConfigProposal: noOpenProposal,
    });
    const assertion = expect(result).rejects.toMatchObject({
      messageId: "proposal.publicationUnconfirmed",
    });
    await vi.runAllTimersAsync();
    await assertion;

    expect(api.proposals.markApplied).not.toHaveBeenCalled();
    expect(api.proposals.recordApplyStep).not.toHaveBeenCalledWith(
      expect.objectContaining({ step: "publication", status: "completed" }),
    );
  });

  it("finishes a resumed application once its DAO vote has executed", async () => {
    const api = client(proposal("node", nodePayload));
    api.registry.getRegistryApp.mockReset().mockResolvedValue(publishedApp("chicago.citynode.app"));
    const publishTenantConfig = vi.fn();
    const findOpenTenantConfigProposal = vi.fn();

    const result = await approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal,
    });

    expect(publishTenantConfig).not.toHaveBeenCalled();
    expect(findOpenTenantConfigProposal).not.toHaveBeenCalled();
    expect(result.applyStatus).toBe("applied");
  });

  it("leaves a retryable record when the final status write fails", async () => {
    const api = client(proposal("node", nodePayload));
    api.proposals.markApplied.mockRejectedValue(new Error("Proposals unavailable"));

    await expect(
      approveAndApplyProposal({
        apiClient: api as unknown as ApiClient,
        proposal: proposal("node", nodePayload),
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        publishTenantConfig: vi.fn().mockResolvedValue(undefined),
        findOpenTenantConfigProposal: noOpenProposal,
      }),
    ).rejects.toMatchObject({ messageId: "proposal.finalizationFailedNamed" });

    expect(api.proposals.recordApplyStep).toHaveBeenCalledWith(
      expect.objectContaining({ step: "publication", status: "completed" }),
    );
    expect(api.proposals.markApplyFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Proposals unavailable" }),
    );
  });

  it("keeps a long DAO signature visibly active while it is open", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    let finishPublish: () => void = () => undefined;
    const publishTenantConfig = vi.fn(
      () => new Promise<void>((resolve) => (finishPublish = resolve)),
    );

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal: noOpenProposal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(publishTenantConfig).toHaveBeenCalledOnce();
    const started = () =>
      api.proposals.recordApplyStep.mock.calls.filter(([call]) => call.status === "started").length;
    expect(started()).toBe(1);

    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    expect(started()).toBe(7);

    finishPublish();
    await vi.runAllTimersAsync();
    expect((await result).applyStatus).toBe("applied");
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(started()).toBe(7);
  });

  it("records the open DAO vote and stops the heartbeat while publishing waits on it", async () => {
    vi.useFakeTimers();
    const api = client(proposal("node", nodePayload));
    let finishPublish: () => void = () => undefined;
    const publishTenantConfig = vi.fn(
      () => new Promise<void>((resolve) => (finishPublish = resolve)),
    );
    const findOpenTenantConfigProposal = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 9 });

    const result = approveAndApplyProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      gatewayId: "citynode.app",
      baseAccount: "everything.near",
      publishTenantConfig,
      findOpenTenantConfigProposal,
    });
    await vi.advanceTimersByTimeAsync(0);
    const publicationCalls = () =>
      api.proposals.recordApplyStep.mock.calls
        .map(([call]) => call)
        .filter((call) => call.step === "publication");

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(publicationCalls().map((call) => call.status)).toEqual([
      "started",
      "started",
      "waiting",
    ]);
    expect(publicationCalls().at(-1)).toMatchObject({ resourceId: "9" });

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(publicationCalls()).toHaveLength(3);

    finishPublish();
    await vi.runAllTimersAsync();
    expect((await result).applyStatus).toBe("applied");
    expect(publicationCalls().at(-1)).toMatchObject({ status: "completed" });
  });
});

describe("rejecting a community application", () => {
  function rejectClient() {
    return {
      releaseCommunityProposal: vi.fn().mockResolvedValue({
        community: { released: true, keptReason: null },
        organization: { released: false, keptReason: "in_use" },
      }),
      proposals: {
        reject: vi.fn().mockResolvedValue({ data: { reviewStatus: "rejected" } }),
      },
    };
  }

  it("removes a failed setup's resources before rejecting it", async () => {
    const api = rejectClient();
    const failed = {
      ...proposal("node", nodePayload),
      reviewStatus: "approved" as const,
      applyStatus: "failed" as const,
    };
    const result = await rejectProposal({
      apiClient: api as unknown as ApiClient,
      proposal: failed,
      reason: "Duplicate community",
    });

    expect(api.releaseCommunityProposal).toHaveBeenCalledWith({
      proposalId: "proposal-id",
      entityId: "chicago",
    });
    expect(api.releaseCommunityProposal.mock.invocationCallOrder[0]).toBeLessThan(
      api.proposals.reject.mock.invocationCallOrder[0]!,
    );
    expect(keptResources(result.released)).toEqual(["organization"]);
  });

  it("does not touch resources when rejecting a pending application", async () => {
    const api = rejectClient();
    await rejectProposal({
      apiClient: api as unknown as ApiClient,
      proposal: proposal("node", nodePayload),
      reason: "Not enough detail",
    });
    expect(api.releaseCommunityProposal).not.toHaveBeenCalled();
    expect(api.proposals.reject).toHaveBeenCalledOnce();
  });

  it("does not reject when removing the resources fails", async () => {
    const api = rejectClient();
    api.releaseCommunityProposal.mockRejectedValue(new Error("Auth unavailable"));
    await expect(
      rejectProposal({
        apiClient: api as unknown as ApiClient,
        proposal: {
          ...proposal("node", nodePayload),
          reviewStatus: "approved" as const,
          applyStatus: "failed" as const,
        },
        reason: "Duplicate community",
      }),
    ).rejects.toThrow("Auth unavailable");
    expect(api.proposals.reject).not.toHaveBeenCalled();
  });
});

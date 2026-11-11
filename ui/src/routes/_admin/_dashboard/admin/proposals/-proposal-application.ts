import type { ApiClient } from "@/app";
import { AppActionError } from "@/i18n/error-message";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import type { Proposal } from "@/lib/queries/proposals";

type ProposalApplicationInput = Pick<
  Proposal,
  "id" | "pluginId" | "entityId" | "payload" | "updatedAt"
>;

function isConflict(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    (Reflect.get(error, "code") === "CONFLICT" || Reflect.get(error, "status") === 409)
  );
}

export async function approveProposal({
  apiClient,
  proposal,
}: {
  apiClient: ApiClient;
  proposal: ProposalApplicationInput;
}) {
  if (proposal.pluginId !== "node") {
    const approved = await apiClient.proposals.approve({
      pluginId: proposal.pluginId,
      entityId: proposal.entityId,
      expectedUpdatedAt: proposal.updatedAt,
    });
    return approved.data;
  }
  try {
    await apiClient.approveOfficialApplication({
      proposalId: proposal.id,
      entityId: proposal.entityId,
      expectedUpdatedAt: proposal.updatedAt,
    });
  } catch (error) {
    if (isConflict(error)) throw new AppActionError("proposal.daoConflict");
    throw error;
  }
  const { data } = await apiClient.proposals.getProposals({
    pluginId: proposal.pluginId,
    entityId: proposal.entityId,
    limit: 1,
  });
  const decided = data.find((entry) => entry.id === proposal.id);
  if (!decided) throw new AppActionError("proposal.decisionUnconfirmed");
  return decided;
}

export async function rejectProposal({
  apiClient,
  proposal,
  reason,
}: {
  apiClient: ApiClient;
  proposal: ProposalApplicationInput;
  reason: string;
}) {
  const rejected = await apiClient.proposals.reject({
    pluginId: proposal.pluginId,
    entityId: proposal.entityId,
    expectedUpdatedAt: proposal.updatedAt,
    reason,
  });
  return rejected.data;
}

export function errorMessage(error: unknown) {
  if (error instanceof AppActionError) {
    return translateEnglishAppMessage(error.messageId, error.values);
  }
  return error instanceof Error ? error.message : String(error);
}

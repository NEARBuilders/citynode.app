import type { ApiClient } from "@/app";
import { AppActionError } from "@/i18n/error-message";
import type { DaoTenantPublishInput } from "@/lib/tenant-deploy";
import { parseNodeProposalPayload } from "@/routes/_authenticated/_dashboard/-node-application";

type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
export type Proposal = ProposalResult["data"][number];

type ProposalApplicationInput = Pick<Proposal, "pluginId" | "entityId" | "payload" | "updatedAt">;

type AppliedResource = { id: string; label: string };
export type TenantConfigPublisher = (input: DaoTenantPublishInput) => Promise<unknown>;
type ProposalApplicationHandler = (input: {
  apiClient: ApiClient;
  proposal: Proposal;
  gatewayId: string;
  baseAccount: string;
  publishTenantConfig: TenantConfigPublisher;
}) => Promise<AppliedResource>;

const proposalApplicationHandlers = {
  node: async ({ apiClient, proposal, gatewayId, baseAccount, publishTenantConfig }) => {
    const payload = parseNodeProposalPayload(proposal.payload);
    const hostname = `${payload.slug}.${gatewayId}`;
    const node = await apiClient.applyNodeProposal({
      ...payload,
      hostname,
    });
    await publishTenantConfig({
      daoAccountId: payload.accountId,
      gatewayId,
      baseAccount,
      hostname,
      title: payload.name,
    });
    return { id: node.nodeId, label: "Node" };
  },
} satisfies Record<string, ProposalApplicationHandler>;

function applicationHandler(pluginId: string): ProposalApplicationHandler | undefined {
  return proposalApplicationHandlers[pluginId as keyof typeof proposalApplicationHandlers];
}

export async function approveAndApplyProposal({
  apiClient,
  proposal,
  gatewayId,
  baseAccount,
  publishTenantConfig,
  onProposalChange,
}: {
  apiClient: ApiClient;
  proposal: ProposalApplicationInput;
  gatewayId: string;
  baseAccount: string;
  publishTenantConfig: TenantConfigPublisher;
  onProposalChange?: (proposal: Proposal) => void;
}) {
  const approved = await apiClient.proposals.approve({
    pluginId: proposal.pluginId,
    entityId: proposal.entityId,
    expectedUpdatedAt: proposal.updatedAt,
  });
  let reviewedProposal = approved.data;
  onProposalChange?.(reviewedProposal);

  let resource: AppliedResource | null = null;
  try {
    const handler = applicationHandler(reviewedProposal.pluginId);
    if (handler) {
      resource = await handler({
        apiClient,
        proposal: reviewedProposal,
        gatewayId,
        baseAccount,
        publishTenantConfig,
      });
    }
  } catch (error) {
    const message = errorMessage(error);
    try {
      const failed = await apiClient.proposals.markApplyFailed({
        pluginId: reviewedProposal.pluginId,
        entityId: reviewedProposal.entityId,
        expectedUpdatedAt: reviewedProposal.updatedAt,
        error: message,
      });
      reviewedProposal = failed.data;
      onProposalChange?.(reviewedProposal);
    } catch {}
    throw new AppActionError("proposal.partiallyApplied");
  }

  if (!resource) return reviewedProposal;

  try {
    const applied = await apiClient.proposals.markApplied({
      pluginId: reviewedProposal.pluginId,
      entityId: reviewedProposal.entityId,
      expectedUpdatedAt: reviewedProposal.updatedAt,
      appliedResourceId: resource.id,
    });
    reviewedProposal = applied.data;
    onProposalChange?.(reviewedProposal);
  } catch {
    throw new AppActionError("proposal.finalizationFailedNamed", { id: resource.id });
  }

  return reviewedProposal;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

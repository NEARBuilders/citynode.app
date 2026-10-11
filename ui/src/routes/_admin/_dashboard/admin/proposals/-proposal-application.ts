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
    const node = await apiClient.applyCommunityProposal({
      proposalId: proposal.id,
      entityId: proposal.entityId,
      hostname,
    });
    const published = () =>
      isTenantConfigPublished(apiClient, payload.accountId, gatewayId, hostname);
    if (!(await published())) {
      try {
        await publishTenantConfig({
          daoAccountId: payload.accountId,
          gatewayId,
          baseAccount,
          hostname,
          title: payload.name,
        });
      } catch (error) {
        if (!(await waitForTenantConfig(published))) throw error;
      }
    }
    return { id: node.nodeId, label: "Node" };
  },
} satisfies Record<string, ProposalApplicationHandler>;

const PUBLISH_CHECK_ATTEMPTS = 3;
const PUBLISH_CHECK_INTERVAL_MS = 2000;

async function isTenantConfigPublished(
  apiClient: ApiClient,
  accountId: string,
  gatewayId: string,
  hostname: string,
) {
  try {
    const app = await apiClient.registry.getRegistryApp({ accountId, gatewayId });
    return app.data.domain?.toLowerCase() === hostname.toLowerCase();
  } catch {
    return false;
  }
}

async function waitForTenantConfig(published: () => Promise<boolean>) {
  for (let attempt = 0; attempt < PUBLISH_CHECK_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, PUBLISH_CHECK_INTERVAL_MS));
    if (await published()) return true;
  }
  return false;
}

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
    if (
      error &&
      typeof error === "object" &&
      (Reflect.get(error, "code") === "CONFLICT" || Reflect.get(error, "status") === 409)
    ) {
      throw new AppActionError("proposal.resourceConflict");
    }
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

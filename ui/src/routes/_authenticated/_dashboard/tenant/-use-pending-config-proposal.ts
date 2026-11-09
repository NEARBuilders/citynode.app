import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  approvalThreshold,
  fetchSputnikPolicy,
  type SputnikPolicy,
  type SputnikProposal,
} from "@/lib/sputnik-proposals";
import { findOpenTenantConfigProposal } from "@/lib/tenant-deploy";
import { TENANT_CONFIG_REFETCH_MS } from "./-use-published-config";

export interface PendingConfigProposal {
  proposal: SputnikProposal | null;
  threshold: ReturnType<typeof approvalThreshold>;
  policy: SputnikPolicy | null | undefined;
}

export function pendingConfigProposalQueryOptions(daoAccountId: string) {
  return queryOptions({
    queryKey: ["node-config", "pending-config-proposal", daoAccountId],
    queryFn: async () => {
      const policy = await fetchSputnikPolicy(daoAccountId);
      const proposal = policy
        ? await findOpenTenantConfigProposal(daoAccountId, policy).catch(() => null)
        : null;
      return { policy, proposal };
    },
    enabled: !!daoAccountId,
    refetchInterval: TENANT_CONFIG_REFETCH_MS,
  });
}

export function usePendingConfigProposal(
  daoAccountId: string,
  enabled: boolean,
): PendingConfigProposal {
  const { data } = useQuery({
    ...pendingConfigProposalQueryOptions(daoAccountId),
    enabled: enabled && !!daoAccountId,
  });
  const proposal = enabled ? (data?.proposal ?? null) : null;
  const policy = data?.policy;
  return { proposal, threshold: approvalThreshold(policy, proposal), policy };
}

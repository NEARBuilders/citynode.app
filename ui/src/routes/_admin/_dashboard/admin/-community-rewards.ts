import { type TeamPoolState, teamPoolState } from "@/components/team-stake-card";
import {
  canReadPool,
  resolveTeamAccountId,
  resolveTeamStakeTarget,
  type StakePoolStatus,
  type StakePoolValidator,
  type TeamStakeTarget,
} from "@/lib/queries/stake-pool";

interface Read<T> {
  data: T | undefined;
  isError: boolean;
}

interface RewardsTenant {
  accountId: string;
  ownerKind: string;
}

interface RewardsOrganization {
  metadata?: Record<string, unknown> | null;
}

interface RewardsValidators {
  validators: readonly StakePoolValidator[];
}

export type CommunityRewards =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "no-dao" }
  | { kind: "no-pool" }
  | { kind: "pool"; pool: TeamPoolState };

function daoAccountIdOf(organization: RewardsOrganization | null | undefined) {
  const value = organization?.metadata?.daoAccountId;
  return typeof value === "string" ? value : null;
}

export function communityRewardsTarget(
  tenant: RewardsTenant,
  organization: RewardsOrganization | null | undefined,
  validators: RewardsValidators | undefined,
): TeamStakeTarget | null {
  const target = resolveTeamStakeTarget({
    daoAccountId: daoAccountIdOf(organization),
    tenantAccountId: tenant.accountId,
    tenantOwnerKind: tenant.ownerKind,
    validators: validators?.validators ?? [],
  });
  return target &&
    canReadPool({
      accountId: target.poolAccountId,
      network: target.network,
      protocol: target.protocol,
    })
    ? target
    : null;
}

export function communityRewards({
  tenant,
  organization,
  validators,
  status,
}: {
  tenant: RewardsTenant;
  organization: Read<RewardsOrganization | null> | null;
  validators: Read<RewardsValidators>;
  status: Read<StakePoolStatus>;
}): CommunityRewards {
  if (organization?.isError || validators.isError) return { kind: "error" };
  if ((organization && organization.data === undefined) || validators.data === undefined) {
    return { kind: "loading" };
  }
  const teamAccountId = resolveTeamAccountId({
    daoAccountId: daoAccountIdOf(organization?.data),
    tenantAccountId: tenant.accountId,
    tenantOwnerKind: tenant.ownerKind,
  });
  if (!teamAccountId) return { kind: "no-dao" };
  if (!communityRewardsTarget(tenant, organization?.data, validators.data)) {
    return { kind: "no-pool" };
  }
  if (status.isError) return { kind: "error" };
  if (status.data === undefined) return { kind: "loading" };
  return { kind: "pool", pool: teamPoolState(status.data, teamAccountId) };
}

export function summarizeCommunityRewards(rewards: readonly CommunityRewards[]) {
  return {
    loading: rewards.some((reward) => reward.kind === "loading"),
    canClaim: rewards.filter((reward) => reward.kind === "pool" && reward.pool.kind === "earning")
      .length,
    unreadable: rewards.filter((reward) => reward.kind === "error").length,
  };
}

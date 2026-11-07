import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useApiClient, useAuthClient } from "@/app";
import { Badge, Button, InfoPopover, Skeleton } from "@/components";
import { poolStateMessage, type TeamPoolState } from "@/components/team-stake-card";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { stakingValidatorsQueryOptions } from "@/lib/queries/nodes";
import { organizationByIdQueryOptions } from "@/lib/queries/organizations";
import { stakePoolStatusQueryOptions } from "@/lib/queries/stake-pool";
import { StatFigure } from "./-admin-ui";
import {
  type CommunityRewards,
  communityRewards,
  communityRewardsTarget,
  summarizeCommunityRewards,
} from "./-community-rewards";

interface RewardsRow {
  node: { id: string };
  tenant: { accountId: string; ownerKind: string; orgId: string | null };
}

interface CommunityRewardsRead {
  rewards: CommunityRewards;
  retry: () => void;
}

export function useCommunityRewards(rows: readonly RewardsRow[]) {
  const apiClient = useApiClient();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const organizations = useQueries({
    queries: rows.map((row) => ({
      ...organizationByIdQueryOptions(apiClient, row.tenant.orgId ?? ""),
      enabled: !!row.tenant.orgId,
    })),
  });
  const validators = useQueries({
    queries: rows.map((row) => stakingValidatorsQueryOptions(apiClient, row.node.id)),
  });
  const statuses = useQueries({
    queries: rows.map((row, index) => {
      const target = communityRewardsTarget(
        row.tenant,
        organizations[index]?.data,
        validators[index]?.data,
      );
      return stakePoolStatusQueryOptions({
        accountId: target?.poolAccountId ?? "",
        authClient,
        queryClient,
        network: target?.network,
        protocol: target?.protocol,
      });
    }),
  });

  const byNode = new Map<string, CommunityRewardsRead>();
  rows.forEach((row, index) => {
    const organization = organizations[index];
    const validator = validators[index];
    const status = statuses[index];
    if (!organization || !validator || !status) return;
    byNode.set(row.node.id, {
      rewards: communityRewards({
        tenant: row.tenant,
        organization: row.tenant.orgId ? organization : null,
        validators: validator,
        status,
      }),
      retry: () => {
        for (const query of [organization, validator, status]) {
          if (query.isError) void query.refetch();
        }
      },
    });
  });
  const reads = [...byNode.values()];
  const summary = summarizeCommunityRewards(reads.map((read) => read.rewards));
  return {
    byNode,
    summary,
    retryUnreadable: () => {
      for (const read of reads) if (read.rewards.kind === "error") read.retry();
    },
  };
}

const POOL_LABELS: Record<
  TeamPoolState["kind"],
  { label: AppMessageId; variant: "success" | "secondary" | "warning" }
> = {
  earning: { label: "admin.progress.rewardsEarning", variant: "success" },
  "run-by-other": { label: "admin.progress.rewardsRunByOther", variant: "secondary" },
  "full-commission": { label: "admin.progress.rewardsFullCommission", variant: "warning" },
  paused: { label: "admin.progress.rewardsPaused", variant: "warning" },
  joining: { label: "admin.progress.rewardsJoining", variant: "secondary" },
  "not-validating": { label: "admin.progress.rewardsNotValidating", variant: "warning" },
};

function RetryNote({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry?: () => void;
  testId: string;
}) {
  const translate = useAppTranslation();
  return (
    <span
      role="alert"
      className="flex flex-wrap items-center gap-x-2 text-sm text-destructive"
      data-testid={testId}
    >
      {message}
      <Button variant="link" size="xs" className="h-auto p-0" onClick={onRetry}>
        {translate("common.retry")}
      </Button>
    </span>
  );
}

export function CommunityRewardsBadge({ read }: { read: CommunityRewardsRead | undefined }) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const rewards = read?.rewards ?? { kind: "loading" };

  if (rewards.kind === "loading") return <Skeleton className="h-5 w-20" />;
  if (rewards.kind === "error") {
    return (
      <RetryNote
        message={translate("admin.progress.rewardsFailed")}
        onRetry={read?.retry}
        testId="admin-progress-rewards-error"
      />
    );
  }
  if (rewards.kind !== "pool") {
    return (
      <Badge variant="outline" data-testid="admin-progress-rewards" data-state={rewards.kind}>
        {translate(
          rewards.kind === "no-dao"
            ? "admin.progress.rewardsNoDao"
            : "admin.progress.rewardsNoPool",
        )}
      </Badge>
    );
  }
  const { label, variant } = POOL_LABELS[rewards.pool.kind];
  const message = poolStateMessage(rewards.pool, translate, locale);
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant} data-testid="admin-progress-rewards" data-state={rewards.pool.kind}>
        {translate(label)}
      </Badge>
      {message && (
        <InfoPopover
          title={translate(label)}
          body={message}
          testId="admin-progress-rewards-detail"
        />
      )}
    </span>
  );
}

export function CommunityRewardsStat({
  summary,
  onRetry,
}: {
  summary: ReturnType<typeof useCommunityRewards>["summary"];
  onRetry: () => void;
}) {
  const translate = useAppTranslation();
  return (
    <StatFigure
      label={translate("admin.progress.canClaim")}
      value={summary.loading ? "—" : summary.canClaim}
      hint={
        summary.unreadable > 0 ? (
          <RetryNote
            message={translate("admin.progress.canClaimUnreadable", {
              count: summary.unreadable,
            })}
            onRetry={onRetry}
            testId="admin.stat.can-claim-unreadable"
          />
        ) : undefined
      }
      testId="admin.stat.can-claim"
    />
  );
}

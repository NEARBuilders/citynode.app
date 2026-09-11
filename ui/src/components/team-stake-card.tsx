import { useQuery } from "@tanstack/react-query";
import { SectionHeader } from "@/components/layout/section-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNearBalance,
  stakePoolAccountQueryOptions,
  type TeamStakeTarget,
} from "@/lib/queries/stake-pool";

export function TeamStakeCard({
  target,
  pending = false,
}: {
  target: TeamStakeTarget | null;
  pending?: boolean;
}) {
  const account = useQuery(
    stakePoolAccountQueryOptions({
      poolAccountId: target?.poolAccountId ?? "",
      stakerAccountId: target?.teamAccountId ?? "",
      network: target?.network,
      protocol: target?.protocol,
    }),
  );
  const accountView = account.isError ? undefined : account.data;
  const loading = pending || (!!target && account.isLoading);

  return (
    <section className="space-y-3" data-testid="dashboard-node.team-stake">
      <SectionHeader title="Available rewards" />
      <Card className="space-y-2 p-6">
        {target ? (
          <>
            <div
              data-testid="dashboard-node.team-stake-amount"
              className="text-2xl font-semibold tabular-nums text-foreground"
            >
              {loading ? (
                <Skeleton aria-label="Loading available rewards" className="h-8 w-40" />
              ) : accountView ? (
                formatNearBalance(accountView.stakedBalance)
              ) : (
                "—"
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{target.teamAccountId}</span>
              {" staked in "}
              <span className="font-mono text-foreground">{target.poolAccountId}</span>
            </p>
          </>
        ) : loading ? (
          <Skeleton aria-label="Loading available rewards" className="h-8 w-40" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Team stake appears once a team DAO and staking pool are linked.
          </p>
        )}
      </Card>
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { describeDaoError, useDaoAutoRestore, useDaoConnection } from "@/lib/dao-connect";
import {
  formatNearBalance,
  invalidateStakePoolQueries,
  stakePoolAccountQueryOptions,
  type TeamStakeTarget,
} from "@/lib/queries/stake-pool";
import { parseUnstakeAmount, proposeTeamUnstake, yoctoToNearInput } from "@/lib/team-unstake";
import { useNearAccount } from "@/lib/use-near-account";

export function TeamStakeCard({
  target,
  pending = false,
}: {
  target: TeamStakeTarget | null;
  pending?: boolean;
}) {
  const queryClient = useQueryClient();
  const authAccountId = useNearAccount();
  const connection = useDaoConnection();
  useDaoAutoRestore(authAccountId);
  const [unstakeOpen, setUnstakeOpen] = useState(false);
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
  const staked = accountView?.stakedBalance;
  const canUnstake = !!target && staked !== undefined && staked > 0n;

  return (
    <section className="space-y-3" data-testid="dashboard-node.team-stake">
      <SectionHeader
        title="Available rewards"
        action={
          target ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="dashboard-node.team-stake-unstake"
              disabled={!canUnstake}
              onClick={() => setUnstakeOpen(true)}
            >
              propose unstake
            </Button>
          ) : null
        }
      />
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
            <UnstakeDialog
              open={unstakeOpen}
              onOpenChange={setUnstakeOpen}
              target={target}
              staked={staked ?? 0n}
              pending={connection.status === "connecting"}
              onPropose={async (amountYocto) => {
                try {
                  await proposeTeamUnstake({
                    teamAccountId: target.teamAccountId,
                    poolAccountId: target.poolAccountId,
                    amountYocto,
                    stakedBalance: staked ?? 0n,
                    authAccountId,
                    connection,
                  });
                  toast.success("Unstake proposed", {
                    description: `Withdraws to ${target.teamAccountId} after the epoch window.`,
                  });
                  setUnstakeOpen(false);
                  await invalidateStakePoolQueries(
                    queryClient,
                    target.poolAccountId,
                    target.network,
                  );
                } catch (error) {
                  toast.error(describeDaoError(error, target.teamAccountId));
                }
              }}
            />
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

function UnstakeDialog({
  open,
  onOpenChange,
  target,
  staked,
  pending,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TeamStakeTarget;
  staked: bigint;
  pending: boolean;
  onPropose: (amountYocto: bigint) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const parsed = parseUnstakeAmount(amount, staked);
  useEffect(() => {
    if (open) setAmount(yoctoToNearInput(staked));
  }, [open, staked]);
  const propose = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Enter an amount within the available team stake.");
      await onPropose(parsed);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose unstake</DialogTitle>
          <DialogDescription>
            Stages a Trezu treasury proposal to unstake this amount from{" "}
            <span className="font-mono">{target.poolAccountId}</span>. After the epoch window,
            withdrawn NEAR returns to the confidential treasury{" "}
            <span className="font-mono">{target.teamAccountId}</span>.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="team-unstake-amount">Amount (NEAR)</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="team-unstake-amount"
              data-testid="dashboard-node.team-stake-unstake-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAmount(yoctoToNearInput(staked))}
            >
              max
            </Button>
          </div>
        </Field>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            cancel
          </Button>
          <Button
            size="sm"
            data-testid="dashboard-node.team-stake-unstake-confirm"
            disabled={!parsed || pending || propose.isPending}
            onClick={() => propose.mutate()}
          >
            {pending || propose.isPending ? "proposing…" : "propose unstake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

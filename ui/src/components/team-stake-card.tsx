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
import { parseUnstakeAmount, proposeTeamPoolAction, yoctoToNearInput } from "@/lib/team-unstake";
import { useNearAccount } from "@/lib/use-near-account";

type PoolPhase = "unstake" | "pending-release" | "withdraw";

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
  const [dialogOpen, setDialogOpen] = useState(false);
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
  const phase: PoolPhase | null = !accountView
    ? null
    : accountView.canWithdraw && accountView.unstakedBalance > 0n
      ? "withdraw"
      : accountView.stakedBalance > 0n
        ? "unstake"
        : accountView.unstakedBalance > 0n
          ? "pending-release"
          : null;
  const actionReady = !!target && !!phase && phase !== "pending-release";

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
              disabled={!actionReady}
              onClick={() => setDialogOpen(true)}
            >
              {phase === "withdraw" ? "propose withdraw" : "propose unstake"}
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
                accountView.stakedBalance > 0n ? (
                  formatNearBalance(accountView.stakedBalance)
                ) : (
                  formatNearBalance(accountView.unstakedBalance)
                )
              ) : (
                "—"
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{target.teamAccountId}</span>
              {" staked in "}
              <span className="font-mono text-foreground">{target.poolAccountId}</span>
            </p>
            {phase === "pending-release" && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="dashboard-node.team-stake-pending-release"
              >
                Unstaked NEAR is locked for the ~2-day epoch window and can be withdrawn once
                released.
              </p>
            )}
            {accountView?.canWithdraw === false && accountView.unstakedBalance > 0n && (
              <p className="text-sm text-muted-foreground">
                Pending release:{" "}
                <span className="font-mono text-foreground">
                  {formatNearBalance(accountView.unstakedBalance)}
                </span>
              </p>
            )}
            <PoolActionDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              target={target}
              accountView={accountView ?? null}
              phase={phase}
              pending={connection.status === "connecting"}
              onPropose={async (method, amountYocto) => {
                try {
                  await proposeTeamPoolAction({
                    teamAccountId: target.teamAccountId,
                    poolAccountId: target.poolAccountId,
                    method,
                    amountYocto,
                    maxAmountYocto:
                      method === "unstake"
                        ? (accountView?.stakedBalance ?? 0n)
                        : (accountView?.unstakedBalance ?? 0n),
                    authAccountId,
                    connection,
                  });
                  toast.success(method === "unstake" ? "Unstake proposed" : "Withdraw proposed", {
                    description:
                      method === "unstake"
                        ? `Ready to withdraw to ${target.teamAccountId} after the ~2-day epoch window.`
                        : `Returns the NEAR to ${target.teamAccountId}.`,
                  });
                  setDialogOpen(false);
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

function PoolActionDialog({
  open,
  onOpenChange,
  target,
  accountView,
  phase,
  pending,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TeamStakeTarget;
  accountView: {
    stakedBalance: bigint;
    unstakedBalance: bigint;
    canWithdraw: boolean;
  } | null;
  phase: PoolPhase | null;
  pending: boolean;
  onPropose: (method: "unstake" | "withdraw", amountYocto: bigint) => Promise<void>;
}) {
  const method = phase === "withdraw" ? "withdraw" : "unstake";
  const max = accountView
    ? method === "unstake"
      ? accountView.stakedBalance
      : accountView.unstakedBalance
    : 0n;
  const [amount, setAmount] = useState("");
  const parsed = parseUnstakeAmount(amount, max);
  useEffect(() => {
    if (open) setAmount(yoctoToNearInput(max));
  }, [open, max]);
  const propose = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error(`Enter an amount within the available team ${method} balance.`);
      await onPropose(method, parsed);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {method === "withdraw" ? "Propose withdraw" : "Propose unstake"}
          </DialogTitle>
          <DialogDescription>
            {method === "withdraw" ? (
              <>
                Stages a Trezu treasury proposal to withdraw this amount from{" "}
                <span className="font-mono">{target.poolAccountId}</span> back to the confidential
                treasury <span className="font-mono">{target.teamAccountId}</span>.
              </>
            ) : (
              <>
                Stages a Trezu treasury proposal to unstake this amount from{" "}
                <span className="font-mono">{target.poolAccountId}</span>. Staking rewards
                automatically compound into the staked balance — there is no separate claim step.
                After the ~2-day epoch window the unstaked NEAR can be withdrawn to{" "}
                <span className="font-mono">{target.teamAccountId}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="team-pool-action-amount">Amount (NEAR)</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="team-pool-action-amount"
              data-testid="dashboard-node.team-stake-unstake-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAmount(yoctoToNearInput(max))}
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
            {pending || propose.isPending
              ? "proposing…"
              : method === "withdraw"
                ? "propose withdraw"
                : "propose unstake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

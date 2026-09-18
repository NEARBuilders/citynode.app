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
  type StakePoolAccountView,
  stakePoolAccountQueryOptions,
  type TeamStakeTarget,
} from "@/lib/queries/stake-pool";
import { parseUnstakeAmount, proposeTeamPoolAction, yoctoToNearInput } from "@/lib/team-unstake";
import { useNearAccount } from "@/lib/use-near-account";

type PoolPhase = "unstake" | "pending-release" | "withdraw";
type PoolMethod = "unstake" | "withdraw";

const PHASE_METHOD: Record<PoolPhase, PoolMethod> = {
  unstake: "unstake",
  "pending-release": "unstake",
  withdraw: "withdraw",
};

const BUTTON_LABEL: Record<PoolMethod, string> = {
  unstake: "propose unstake",
  withdraw: "propose withdraw",
};

const DIALOG_TITLE: Record<PoolMethod, string> = {
  unstake: "Propose unstake",
  withdraw: "Propose withdraw",
};

function maxBalanceOf(method: PoolMethod, accountView: StakePoolAccountView | undefined) {
  return method === "unstake"
    ? (accountView?.stakedBalance ?? 0n)
    : (accountView?.unstakedBalance ?? 0n);
}

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
  const method: PoolMethod | null = phase ? PHASE_METHOD[phase] : null;
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
              {method ? BUTTON_LABEL[method] : "propose unstake"}
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
                formatNearBalance(
                  method === "withdraw" || phase === "pending-release"
                    ? accountView.unstakedBalance
                    : accountView.stakedBalance,
                )
              ) : (
                "—"
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{target.teamAccountId}</span>
              {method === "withdraw" || phase === "pending-release"
                ? " unstaked from "
                : " staked in "}
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
            {phase === "unstake" && accountView && accountView.unstakedBalance > 0n && (
              <p className="text-sm text-muted-foreground">
                {accountView.canWithdraw ? "Ready to withdraw: " : "Pending release: "}
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
              method={method}
              pending={connection.status === "connecting"}
              onPropose={async (selected, amountYocto) => {
                try {
                  await proposeTeamPoolAction({
                    teamAccountId: target.teamAccountId,
                    poolAccountId: target.poolAccountId,
                    method: selected,
                    amountYocto,
                    maxAmountYocto: maxBalanceOf(selected, accountView),
                    authAccountId,
                    connection,
                  });
                  toast.success(selected === "unstake" ? "Unstake proposed" : "Withdraw proposed", {
                    description:
                      selected === "unstake"
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
  method,
  pending,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TeamStakeTarget;
  accountView: StakePoolAccountView | null;
  method: PoolMethod | null;
  pending: boolean;
  onPropose: (method: PoolMethod, amountYocto: bigint) => Promise<void>;
}) {
  const action: PoolMethod = method ?? "unstake";
  const max = maxBalanceOf(action, accountView ?? undefined);
  const [amount, setAmount] = useState("");
  const parsed = parseUnstakeAmount(amount, max);
  useEffect(() => {
    if (open) setAmount(yoctoToNearInput(max));
  }, [open, max]);
  const propose = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error(`Enter an amount within the available team ${action} balance.`);
      await onPropose(action, parsed);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{DIALOG_TITLE[action]}</DialogTitle>
          <DialogDescription>
            Stages a Trezu treasury proposal to {action} this amount from{" "}
            <span className="font-mono">{target.poolAccountId}</span>
            {action === "withdraw" ? (
              <>
                {" "}
                back to the confidential treasury{" "}
                <span className="font-mono">{target.teamAccountId}</span>.
              </>
            ) : (
              <>
                . Staking rewards automatically compound into the staked balance — there is no
                separate claim step. After the ~2-day epoch window the unstaked NEAR can be
                withdrawn to <span className="font-mono">{target.teamAccountId}</span>.
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
            {pending || propose.isPending ? "proposing…" : BUTTON_LABEL[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

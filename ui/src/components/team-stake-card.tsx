import {
  keepPreviousData,
  type QueryCacheNotifyEvent,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Data, Effect, Fiber, Scheduler } from "effect";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type AuthClient, useAuthClient } from "@/app";
import { SectionHeader } from "@/components/layout/section-header";
import { useLocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppTranslator } from "@/i18n/catalogs";
import { AppActionError } from "@/i18n/error-message";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import {
  describeDaoError,
  type UseDaoConnectionResult,
  useDaoAutoRestore,
  useDaoConnection,
} from "@/lib/dao-connect";
import {
  formatNearBalance,
  invalidateStakePoolQueries,
  readStakePoolAccount,
  type StakePoolAccountView,
  stakePoolAccountQueryOptions,
  stakePoolQueryKeys,
  type TeamStakeTarget,
} from "@/lib/queries/stake-pool";
import {
  canAccountApprove,
  canAccountPropose,
  isOpenProposal,
  needsDelegationBalance,
  proposalCallsMethod,
  readChainTimeNs,
  readDaoProposalsSince,
  readDelegationBalance,
  readSputnikPolicy,
  type SputnikPolicy,
  trezuDaoUrl,
} from "@/lib/sputnik-proposals";
import {
  maxMinusOneNear,
  parseUnstakeAmount,
  proposeTeamPoolAction,
  yoctoToNearInput,
} from "@/lib/team-unstake";
import { useNearAccount } from "@/lib/use-near-account";

type PoolPhase = "unstake" | "pending-release" | "withdraw" | "proposal-pending";
type PoolMethod = "unstake" | "withdraw";

interface TeamPoolProposals {
  open: boolean;
  failedUntilMs: number | null;
}

export function teamPoolPhase(
  accountView: StakePoolAccountView | undefined,
  hasOpenProposal: boolean,
): PoolPhase | null {
  if (!accountView) return null;
  if (hasOpenProposal) return "proposal-pending";
  if (accountView.unstakedBalance > 0n) {
    return accountView.canWithdraw ? "withdraw" : "pending-release";
  }
  if (accountView.stakedBalance > 0n) return "unstake";
  return null;
}

function poolMethodOf(phase: PoolPhase | null): PoolMethod | null {
  return phase === "withdraw" || phase === "unstake" ? phase : null;
}

function canStartTeamPoolAction(
  target: TeamStakeTarget | null,
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
  delegationBalance?: bigint,
): boolean {
  return teamRulesReadable(target) && canAccountPropose(policy, accountId, delegationBalance);
}

function teamRulesReadable(target: TeamStakeTarget | null): target is TeamStakeTarget {
  return !!target && target.network === "mainnet";
}

export function canSeeTeamStake({
  canManage,
  inFinanceTeam,
  policy,
  policyUnreadable = false,
  accountId,
  delegationBalance,
}: {
  canManage: boolean;
  inFinanceTeam: boolean;
  policy: SputnikPolicy | null | undefined;
  policyUnreadable?: boolean;
  accountId: string | null;
  delegationBalance?: bigint;
}): boolean {
  return (
    canManage ||
    inFinanceTeam ||
    (policyUnreadable && !!accountId) ||
    canAccountPropose(policy, accountId, delegationBalance) ||
    canAccountApprove(policy, accountId, delegationBalance)
  );
}

const TEAM_POOL_RELEASE_METHODS = [
  "unstake",
  "unstake_all",
  "withdraw",
  "withdraw_all",
  "withdraw_all_from_staking_pool",
] as const;

const teamPoolQueryKeys = {
  policy: (target: TeamStakeTarget | null) => ["team-pool-policy", target?.teamAccountId] as const,
  proposals: (target: TeamStakeTarget | null) =>
    ["team-pool-proposals", target?.teamAccountId, target?.poolAccountId] as const,
  delegations: (target: TeamStakeTarget | null) =>
    ["team-pool-delegation", target?.teamAccountId] as const,
  account: (target: TeamStakeTarget) =>
    stakePoolQueryKeys.account(target.poolAccountId, target.network, target.teamAccountId),
};

function teamPolicyQueryOptions(target: TeamStakeTarget | null) {
  return {
    queryKey: teamPoolQueryKeys.policy(target),
    queryFn: () => readSputnikPolicy(target?.teamAccountId ?? ""),
    enabled: teamRulesReadable(target),
    staleTime: 60_000,
  };
}

function teamDelegationQueryOptions(
  target: TeamStakeTarget | null,
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
) {
  return {
    queryKey: [...teamPoolQueryKeys.delegations(target), accountId] as const,
    queryFn: () => readDelegationBalance(target?.teamAccountId ?? "", accountId ?? ""),
    enabled: teamRulesReadable(target) && needsDelegationBalance(policy, accountId),
    staleTime: 60_000,
  };
}

function teamPoolProposalsQueryOptions(target: TeamStakeTarget | null, queryClient: QueryClient) {
  return {
    queryKey: teamPoolQueryKeys.proposals(target),
    queryFn: async (): Promise<TeamPoolProposals> => {
      if (!target) return { open: false, failedUntilMs: null };
      return readTeamPoolProposals(
        target,
        await queryClient.fetchQuery(teamPolicyQueryOptions(target)),
      );
    },
    enabled: teamRulesReadable(target),
    refetchInterval: 30_000,
  };
}

async function readTeamPoolProposals(
  target: TeamStakeTarget,
  policy: SputnikPolicy | null,
): Promise<TeamPoolProposals> {
  const chainNowNs = await readChainTimeNs();
  const sinceNs = policy?.proposal_period ? chainNowNs - BigInt(policy.proposal_period) : 0n;
  const proposals = await readDaoProposalsSince(target.teamAccountId, sinceNs);
  const open = proposals.filter(
    (proposal) =>
      isOpenProposal(proposal, policy, chainNowNs) &&
      proposalCallsMethod(proposal, target.poolAccountId, TEAM_POOL_RELEASE_METHODS),
  );
  const period = policy?.proposal_period;
  const onlyFailed =
    !!period && open.length > 0 && open.every((proposal) => proposal.status === "Failed");
  return {
    open: open.length > 0,
    failedUntilMs: onlyFailed
      ? Math.max(
          ...open.map((proposal) =>
            Number((BigInt(proposal.submission_time) + BigInt(period)) / 1_000_000n),
          ),
        )
      : null,
  };
}

export function createButtonLabel(t: AppTranslator) {
  return {
    unstake: t("stake.proposeUnstake"),
    withdraw: t("stake.proposeWithdraw"),
  };
}

export function createDialogTitle(t: AppTranslator) {
  return {
    unstake: t("stake.proposeUnstake"),
    withdraw: t("stake.proposeWithdraw"),
  };
}

function maxBalanceOf(method: PoolMethod, accountView: StakePoolAccountView | undefined) {
  return method === "unstake"
    ? (accountView?.stakedBalance ?? 0n)
    : (accountView?.unstakedBalance ?? 0n);
}

function teamPoolAccountQueryOptions(
  target: TeamStakeTarget | null,
  authClient: AuthClient,
  syncedTo: number,
) {
  return stakePoolAccountQueryOptions({
    poolAccountId: target?.poolAccountId ?? "",
    stakerAccountId: target?.teamAccountId ?? "",
    authClient,
    network: target?.network,
    protocol: target?.protocol,
    syncedTo,
  });
}

function teamPoolReadKeys(target: TeamStakeTarget) {
  return [
    teamPoolQueryKeys.policy(target),
    teamPoolQueryKeys.proposals(target),
    teamPoolQueryKeys.delegations(target),
    teamPoolQueryKeys.account(target),
  ] as const;
}

function startsWithKey(queryKey: readonly unknown[], prefix: readonly unknown[]) {
  return prefix.every((part, index) => queryKey[index] === part);
}

function isFirstSyncedPoolRead(
  target: TeamStakeTarget,
  queryKey: readonly unknown[],
  dataUpdateCount: number,
) {
  const poolKey = teamPoolQueryKeys.account(target);
  return (
    dataUpdateCount === 1 && queryKey.length > poolKey.length && startsWithKey(queryKey, poolKey)
  );
}

class TeamPoolReadFailed extends Data.TaggedError("TeamPoolReadFailed")<{
  readonly cause: unknown;
}> {}

class TeamPoolReadSuperseded extends Data.TaggedError("TeamPoolReadSuperseded") {}

class TeamPoolSubmitBlocked extends Data.TaggedError("TeamPoolSubmitBlocked")<{
  readonly blocker: SubmitBlocker;
}> {}

function chainRead<A>(read: () => Promise<A>) {
  return Effect.tryPromise({ try: read, catch: (cause) => new TeamPoolReadFailed({ cause }) });
}

const readFreshTeamPool = Effect.fn("readFreshTeamPool")(function* (
  authClient: AuthClient,
  target: TeamStakeTarget,
  accountId: string | null,
) {
  const policy = yield* chainRead(() => readSputnikPolicy(target.teamAccountId));
  const proposals = yield* chainRead(() => readTeamPoolProposals(target, policy));
  const accountView = yield* chainRead(() =>
    readStakePoolAccount({
      poolAccountId: target.poolAccountId,
      stakerAccountId: target.teamAccountId,
      authClient,
      network: target.network,
      protocol: target.protocol,
    }),
  );
  const delegationBalance = teamDelegationQueryOptions(target, policy, accountId).enabled
    ? yield* chainRead(() => readDelegationBalance(target.teamAccountId, accountId ?? ""))
    : undefined;
  const phase = teamPoolPhase(accountView, proposals.open);
  return {
    phase,
    method: poolMethodOf(phase),
    canStart: canStartTeamPoolAction(target, policy, accountId, delegationBalance),
    accountView,
  };
});

type FreshTeamPool = Effect.Success<ReturnType<typeof readFreshTeamPool>>;

function supersedesTeamPoolRead(target: TeamStakeTarget, event: QueryCacheNotifyEvent) {
  if (event.type !== "updated") return false;
  if (event.action.type !== "success" && event.action.type !== "error") return false;
  const { queryKey, state } = event.query;
  if (
    event.action.type === "success" &&
    isFirstSyncedPoolRead(target, queryKey, state.dataUpdateCount)
  )
    return false;
  return teamPoolReadKeys(target).some((key) => startsWithKey(queryKey, key));
}

function teamPoolReadSuperseded(queryClient: QueryClient, target: TeamStakeTarget) {
  return Effect.callback<never, TeamPoolReadSuperseded>((resume) => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!supersedesTeamPoolRead(target, event)) return;
      unsubscribe();
      resume(Effect.fail(new TeamPoolReadSuperseded()));
    });
    return Effect.sync(unsubscribe);
  });
}

function submitBlocker(fresh: FreshTeamPool, selected: PoolMethod, amountYocto: bigint) {
  if (fresh.phase === "proposal-pending") return "stake.proposalPending";
  if (fresh.phase === "pending-release") return "stake.unlockNotice";
  if (fresh.method !== selected) return "stake.readFailed";
  if (!fresh.canStart) return "stake.proposersOnly";
  if (amountYocto > maxBalanceOf(selected, fresh.accountView)) {
    return selected === "unstake" ? "stake.invalidTeamUnstake" : "stake.invalidTeamWithdraw";
  }
  return null;
}

type SubmitBlocker = NonNullable<ReturnType<typeof submitBlocker>>;

interface TeamPoolSubmission {
  authClient: AuthClient;
  queryClient: QueryClient;
  target: TeamStakeTarget;
  accountId: string | null;
  selected: PoolMethod;
  amountYocto: bigint;
}

const readSubmittableTeamPool = Effect.fn("readSubmittableTeamPool")(function* ({
  authClient,
  queryClient,
  target,
  accountId,
  selected,
  amountYocto,
}: TeamPoolSubmission) {
  const read = readFreshTeamPool(authClient, target, accountId).pipe(
    Effect.raceFirst(teamPoolReadSuperseded(queryClient, target)),
  );
  const fresh = yield* read.pipe(
    Effect.catchTag("TeamPoolReadSuperseded", () => Effect.andThen(Effect.yieldNow, read)),
    Effect.catchTag(["TeamPoolReadFailed", "TeamPoolReadSuperseded"], () =>
      Effect.fail(new TeamPoolSubmitBlocked({ blocker: "stake.readFailed" })),
    ),
  );
  const blocker = submitBlocker(fresh, selected, amountYocto);
  if (blocker) return yield* new TeamPoolSubmitBlocked({ blocker });
  return fresh;
});

interface TeamPoolSubmitter {
  connection: Pick<UseDaoConnectionResult, "daoAccountId" | "connect" | "disconnect">;
  translate: AppTranslator;
  closeDialog: () => void;
}

const submitTeamPoolAction = Effect.fn("submitTeamPoolAction")(
  function* (
    submission: TeamPoolSubmission,
    { connection, translate, closeDialog }: TeamPoolSubmitter,
  ) {
    const { queryClient, target, selected, amountYocto } = submission;
    const fresh = yield* Effect.interruptible(readSubmittableTeamPool(submission));
    yield* proposeTeamPoolAction({
      teamAccountId: target.teamAccountId,
      poolAccountId: target.poolAccountId,
      method: selected,
      amountYocto,
      maxAmountYocto: maxBalanceOf(selected, fresh.accountView),
      authAccountId: submission.accountId,
      connection,
      beforeSign: Effect.asVoid(readSubmittableTeamPool(submission)),
    });
    toast.success(
      translate(selected === "unstake" ? "stake.unstakeProposed" : "stake.withdrawProposed"),
      {
        description:
          selected === "unstake"
            ? translate("stake.withdrawDelay", { account: target.teamAccountId ?? "" })
            : translate("stake.returnAccount", { account: target.teamAccountId ?? "" }),
      },
    );
    closeDialog();
    yield* Effect.promise(() =>
      Promise.all([
        invalidateStakePoolQueries(queryClient, target.poolAccountId, target.network),
        queryClient.invalidateQueries({ queryKey: teamPoolQueryKeys.proposals(target) }),
      ]),
    );
  },
  (effect, { queryClient, target }, { translate, closeDialog }) =>
    effect.pipe(
      Effect.catchTags({
        TeamPoolSubmitBlocked: ({ blocker }) =>
          Effect.sync(() => {
            closeDialog();
            toast.error(translate(blocker));
            void queryClient.invalidateQueries({
              predicate: (query) =>
                teamPoolReadKeys(target).some((key) => startsWithKey(query.queryKey, key)),
            });
          }),
        AppActionError: (error) =>
          Effect.sync(() => {
            toast.error(describeDaoError(error, target.teamAccountId, translate));
          }),
        TeamPoolWalletFailed: ({ cause }) =>
          Effect.sync(() => {
            toast.error(describeDaoError(cause, target.teamAccountId, translate));
          }),
      }),
      Effect.catchDefect((defect) =>
        Effect.sync(() => {
          toast.error(describeDaoError(defect, target.teamAccountId, translate));
        }),
      ),
    ),
  Effect.uninterruptible,
  Effect.provideService(Scheduler.PreventSchedulerYield, true),
);

function interruptSubmission(submission: { current: Fiber.Fiber<void> | null }) {
  const fiber = submission.current;
  submission.current = null;
  if (fiber) Effect.runFork(Fiber.interrupt(fiber));
}

export function useCanSeeTeamStake(
  target: TeamStakeTarget | null,
  { canManage, inFinanceTeam }: { canManage: boolean; inFinanceTeam: boolean },
): boolean {
  const accountId = useNearAccount();
  const policyOptions = teamPolicyQueryOptions(target);
  const policy = useQuery({
    ...policyOptions,
    enabled: policyOptions.enabled && !canManage && !inFinanceTeam && !!accountId,
  });
  const delegationOptions = teamDelegationQueryOptions(target, policy.data, accountId);
  const delegation = useQuery({
    ...delegationOptions,
    enabled: delegationOptions.enabled && !canManage && !inFinanceTeam,
  });
  return canSeeTeamStake({
    canManage,
    inFinanceTeam,
    policy: policy.data,
    policyUnreadable:
      (!!target && !teamRulesReadable(target)) ||
      (policy.errorUpdateCount > 0 && policy.data === undefined) ||
      (delegationOptions.enabled &&
        delegation.errorUpdateCount > 0 &&
        delegation.data === undefined),
    accountId,
    delegationBalance: delegation.data,
  });
}

function useTeamPoolReads(
  target: TeamStakeTarget | null,
  authClient: AuthClient,
  queryClient: QueryClient,
  accountId: string | null,
) {
  const proposals = useQuery(teamPoolProposalsQueryOptions(target, queryClient));
  const account = useQuery({
    ...teamPoolAccountQueryOptions(target, authClient, proposals.dataUpdatedAt),
    placeholderData: keepPreviousData,
  });
  const policy = useQuery(teamPolicyQueryOptions(target));
  const delegationOptions = teamDelegationQueryOptions(target, policy.data, accountId);
  const delegation = useQuery(delegationOptions);
  const delegationNeeded = delegationOptions.enabled;
  const accountView = account.isError ? undefined : account.data;
  const readFailed =
    account.isError ||
    policy.isError ||
    proposals.isError ||
    (delegationNeeded && delegation.isError);
  const fetching =
    account.isFetching ||
    policy.isFetching ||
    proposals.isFetching ||
    (delegationNeeded && delegation.isFetching);
  const rolesRead = policy.isSuccess && (!delegationNeeded || delegation.isSuccess);
  const readsSucceeded = account.isSuccess && proposals.isSuccess && rolesRead;
  const phase = readFailed ? null : teamPoolPhase(accountView, !!proposals.data?.open);
  return {
    accountView,
    reading: account.isLoading || proposals.isLoading,
    readFailed,
    rolesRead,
    phase,
    failedUntilMs: proposals.data?.failedUntilMs ?? null,
    method: readsSucceeded ? poolMethodOf(phase) : null,
    canStart: canStartTeamPoolAction(
      target,
      policy.data,
      accountId,
      delegationNeeded ? delegation.data : undefined,
    ),
    settled: !fetching && !account.isPlaceholderData,
    retry: () => {
      void account.refetch();
      void policy.refetch();
      void proposals.refetch();
      if (delegationNeeded) void delegation.refetch();
    },
  };
}

export function TeamStakeCard({
  target,
  pending = false,
}: {
  target: TeamStakeTarget | null;
  pending?: boolean;
}) {
  const { locale } = useAppLocale();
  const translate = useAppTranslation();
  const BUTTON_LABEL = createButtonLabel(translate);

  const queryClient = useQueryClient();
  const authClient = useAuthClient();
  const authAccountId = useNearAccount();
  const connection = useDaoConnection();
  useDaoAutoRestore(authAccountId);
  const [dialogMethod, setDialogMethod] = useState<PoolMethod | null>(null);
  const submission = useRef<Fiber.Fiber<void> | null>(null);
  const {
    accountView,
    reading,
    readFailed,
    rolesRead,
    phase,
    failedUntilMs,
    method,
    canStart,
    settled,
    retry,
  } = useTeamPoolReads(target, authClient, queryClient, authAccountId);
  const failedUntil = useLocalDate(failedUntilMs, "datetime");
  const loading = pending || (!!target && reading);
  const dataReady = !!target && !!method && canStart;
  const actionReady = dataReady && settled;
  const dialogOpen = dataReady && dialogMethod === method;
  const proposersOnly = !!method && rolesRead && !canStart;
  const rulesUnreadable = !!target && !teamRulesReadable(target);

  const closeDialog = () => {
    interruptSubmission(submission);
    setDialogMethod(null);
  };

  useEffect(() => () => interruptSubmission(submission), []);

  useEffect(() => {
    if (dialogMethod !== null && (!dataReady || dialogMethod !== method)) {
      interruptSubmission(submission);
      setDialogMethod(null);
    }
  }, [dialogMethod, dataReady, method]);

  const identity = [target?.teamAccountId, target?.poolAccountId, authAccountId].join("|");
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    interruptSubmission(submission);
    setDialogMethod(null);
  }, [identity]);

  const balancePhase = phase === "proposal-pending" ? teamPoolPhase(accountView, false) : phase;
  const showsUnstaked = balancePhase === "withdraw" || balancePhase === "pending-release";
  const balanceLabel = showsUnstaked ? translate("stake.unstaked") : translate("stake.staked");

  return (
    <section className="flex flex-col gap-4" data-testid="dashboard-node.team-stake">
      <SectionHeader
        title={translate("stake.teamStake")}
        description={
          target
            ? translate("stake.teamPoolNamed", {
                team: target.teamAccountId,
                pool: target.poolAccountId,
              })
            : undefined
        }
        action={
          target ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="dashboard-node.team-stake-unstake"
              disabled={!actionReady}
              onClick={() => setDialogMethod(method)}
            >
              {method ? BUTTON_LABEL[method] : BUTTON_LABEL.unstake}
            </Button>
          ) : null
        }
      />
      {target ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{balanceLabel}</span>
          <div
            data-testid="dashboard-node.team-stake-amount"
            className="text-3xl font-semibold tabular-nums wrap-anywhere text-foreground sm:text-4xl"
          >
            {loading ? (
              <Skeleton aria-label={translate("stake.loadingTeam")} className="h-10 w-40" />
            ) : accountView ? (
              formatNearBalance(
                showsUnstaked ? accountView.unstakedBalance : accountView.stakedBalance,
                locale,
              )
            ) : (
              "—"
            )}
          </div>
          {phase === "pending-release" && (
            <TeamStakeNote testId="dashboard-node.team-stake-pending-release">
              {translate("stake.unlockNotice")}
            </TeamStakeNote>
          )}
          {phase === "proposal-pending" && (
            <TeamStakeNote testId="dashboard-node.team-stake-proposal-pending">
              {failedUntilMs !== null
                ? translate("stake.proposalFailed", { date: failedUntil })
                : translate("stake.proposalPending")}{" "}
              <TrezuRequestsLink teamAccountId={target.teamAccountId}>
                {translate(failedUntilMs !== null ? "stake.reviewTrezu" : "stake.voteTrezu")}
              </TrezuRequestsLink>
            </TeamStakeNote>
          )}
          {proposersOnly && (
            <TeamStakeNote testId="dashboard-node.team-stake-proposers-only">
              {translate("stake.proposersOnly")}{" "}
              <TrezuRequestsLink teamAccountId={target.teamAccountId}>
                {translate("stake.askTrezu")}
              </TrezuRequestsLink>
            </TeamStakeNote>
          )}
          {rulesUnreadable && (
            <TeamStakeNote testId="dashboard-node.team-stake-rules-unreadable">
              {translate("stake.testnetPaused")}
            </TeamStakeNote>
          )}
          {readFailed && (
            <div
              className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              data-testid="dashboard-node.team-stake-read-failed"
            >
              <span>{translate("stake.readFailed")}</span>
              <Button size="sm" variant="outline" onClick={retry}>
                {translate("common.retry")}
              </Button>
            </div>
          )}
          {method ? (
            <PoolActionDialog
              open={dialogOpen}
              onOpenChange={(next) => {
                if (!next) closeDialog();
              }}
              accountView={accountView ?? null}
              method={method}
              pending={connection.status === "connecting"}
              settled={settled}
              onPropose={(selected, amountYocto) => {
                if (!actionReady || selected !== method) {
                  closeDialog();
                  return Promise.resolve();
                }
                interruptSubmission(submission);
                const fiber = Effect.runFork(
                  submitTeamPoolAction(
                    {
                      authClient,
                      queryClient,
                      target,
                      accountId: authAccountId,
                      selected,
                      amountYocto,
                    },
                    { connection, translate, closeDialog },
                  ),
                );
                submission.current = fiber;
                return Effect.runPromise(Effect.asVoid(Fiber.await(fiber)));
              }}
            />
          ) : null}
        </div>
      ) : loading ? (
        <Skeleton aria-label={translate("stake.loadingTeam")} className="h-10 w-40" />
      ) : (
        <p className="text-sm text-muted-foreground">{translate("stake.linkTreasury")}</p>
      )}
    </section>
  );
}

function TeamStakeNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

function TrezuRequestsLink({
  teamAccountId,
  children,
}: {
  teamAccountId: string;
  children: ReactNode;
}) {
  return (
    <a
      className="text-foreground underline underline-offset-4"
      href={`${trezuDaoUrl(teamAccountId)}/requests`}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function PoolActionDialog({
  open,
  onOpenChange,
  accountView,
  method: action,
  pending,
  settled,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountView: StakePoolAccountView | null;
  method: PoolMethod;
  pending: boolean;
  settled: boolean;
  onPropose: (method: PoolMethod, amountYocto: bigint) => Promise<void>;
}) {
  const translate = useAppTranslation();
  const BUTTON_LABEL = createButtonLabel(translate);
  const DIALOG_TITLE = createDialogTitle(translate);

  const max = maxBalanceOf(action, accountView ?? undefined);
  const fill = yoctoToNearInput(action === "unstake" ? maxMinusOneNear(max) : max);
  const [amount, setAmount] = useState("");
  const parsed = parseUnstakeAmount(amount, max);
  useEffect(() => {
    if (open) setAmount(fill);
  }, [open, fill]);
  const propose = useMutation({
    mutationFn: async () => {
      if (!parsed)
        throw new AppActionError(
          action === "unstake" ? "stake.invalidTeamUnstake" : "stake.invalidTeamWithdraw",
        );
      await onPropose(action, parsed);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{DIALOG_TITLE[action]}</DialogTitle>
          <DialogDescription>
            {action === "withdraw"
              ? translate("stake.withdrawProposal")
              : translate("stake.unstakeProposal")}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="team-pool-action-amount">{translate("stake.amountNear")}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="team-pool-action-amount"
              data-testid="dashboard-node.team-stake-unstake-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={() => setAmount(fill)}>
                {translate("stake.max")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {translate("common.cancel")}
          </Button>
          <Button
            size="sm"
            data-testid="dashboard-node.team-stake-unstake-confirm"
            disabled={!parsed || pending || !settled || propose.isPending}
            onClick={() => propose.mutate()}
          >
            {pending || propose.isPending ? translate("stake.proposing") : BUTTON_LABEL[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

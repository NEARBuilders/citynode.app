import { ArrowSquareOutIcon, CheckCircleIcon, ClockIcon } from "@phosphor-icons/react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient, useAuthClient } from "@/app";
import { Badge, Button, Field, FieldLabel, Input, SectionHeader } from "@/components";
import { FieldGroup } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppMessageId } from "@/i18n/catalogs";
import { AppActionError, appErrorMessage } from "@/i18n/error-message";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { parseNearAmount } from "@/lib/near-amount";
import {
  buildNodeSequence,
  buildVotePlan,
  describePlanCall,
  EMPTY_CHAIN,
  type NodeSequenceActionId,
  type NodeSequenceBalances,
  type NodeSequenceBlocker,
  type NodeSequenceStep,
  type NodeSequenceStepId,
  type NodeTreasury,
  nodeSequenceBalances,
  pendingProposalFor,
  pendingVoteProposalFor,
  proposalDescription,
  readActiveGovProposals,
  readNodeSequenceChain,
  readTeamSnapshotVote,
  readTeamVote,
  readVoteStorageFee,
  type SnapshotVote,
  voteStepOption,
  withEndowment,
} from "@/lib/node-staking-proposals";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import {
  formatNearBalance,
  requireApprovedStakeStep,
  resolveTeamAccountId,
} from "@/lib/queries/stake-pool";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import {
  canAccountPropose,
  type DaoPlan,
  fetchSputnikPolicy,
  proposeAsSession,
  readOpenDaoProposals,
  trezuDaoUrl,
} from "@/lib/sputnik-proposals";
import { useNearAccount } from "@/lib/use-near-account";

type Validator = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["validators"][number];

const ACTION_TITLES: Record<NodeSequenceActionId, AppMessageId> = {
  "team-stake": "admin.sequence.teamStake",
  "team-house-of-stake": "admin.sequence.teamHos",
  "endowment-stake": "admin.sequence.endowmentStake",
  "endowment-delegate": "admin.sequence.endowmentDelegate",
  "team-vote": "admin.sequence.teamVote",
  "team-unwind": "admin.sequence.teamUnwind",
  "endowment-unwind": "admin.sequence.endowmentUnwind",
};

const ACTION_HINTS: Record<NodeSequenceActionId, AppMessageId> = {
  "team-stake": "admin.sequence.teamStakeHint",
  "team-house-of-stake": "admin.sequence.teamHosHint",
  "endowment-stake": "admin.sequence.endowmentStakeHint",
  "endowment-delegate": "admin.sequence.endowmentDelegateHint",
  "team-vote": "admin.sequence.teamVoteHint",
  "team-unwind": "admin.sequence.teamUnwindHint",
  "endowment-unwind": "admin.sequence.endowmentUnwindHint",
};

const STEP_LABELS: Record<NodeSequenceStepId, AppMessageId> = {
  stake: "admin.sequence.step.stake",
  register: "admin.sequence.step.register",
  "deploy-lockup": "admin.sequence.step.deployLockup",
  lock: "admin.sequence.step.lock",
  "register-endowment": "admin.sequence.step.register",
  "deploy-lockup-endowment": "admin.sequence.step.deployLockup",
  "fund-lockup": "admin.sequence.step.fundLockup",
  "lock-endowment": "admin.sequence.step.lock",
  "unselect-old-pool": "admin.sequence.step.unselectPool",
  "select-pool": "admin.sequence.step.selectPool",
  "stake-endowment": "admin.sequence.step.stakeLockup",
  "set-delegations": "admin.sequence.step.delegate",
  "vote-for": "admin.sequence.step.voteFor",
  "vote-against": "admin.sequence.step.voteAgainst",
  "vote-abstain": "admin.sequence.step.voteAbstain",
  "unstake-team": "admin.sequence.step.unstakeAll",
  "withdraw-team": "admin.sequence.step.withdrawAll",
  "unstake-endowment": "admin.sequence.step.unstakeAll",
  "withdraw-endowment": "admin.sequence.step.withdrawAll",
  "release-pool": "admin.sequence.step.releasePool",
  "clear-delegations": "admin.sequence.step.clearDelegations",
};

const BLOCKER_LABELS: Record<NodeSequenceBlocker, AppMessageId> = {
  teamNotRegistered: "admin.sequence.blocker.teamNotRegistered",
  teamNoLockup: "admin.sequence.blocker.teamNoLockup",
  teamNothingToLock: "admin.sequence.blocker.teamNothingToLock",
  endowmentNotRegistered: "admin.sequence.blocker.endowmentNotRegistered",
  endowmentNoLockup: "admin.sequence.blocker.endowmentNoLockup",
  endowmentNotFunded: "admin.sequence.blocker.endowmentNotFunded",
  endowmentOtherPool: "admin.sequence.blocker.endowmentOtherPool",
  endowmentPoolNotSelected: "admin.sequence.blocker.endowmentPoolNotSelected",
  endowmentNotLocked: "admin.sequence.blocker.endowmentNotLocked",
  endowmentNotStaked: "admin.sequence.blocker.endowmentNotStaked",
  teamNoVotingPower: "admin.sequence.blocker.teamNoVotingPower",
  teamNoSnapshotPower: "admin.sequence.blocker.teamNoSnapshotPower",
  teamNotStaked: "admin.sequence.blocker.teamNotStaked",
  teamNothingUnstaked: "admin.sequence.blocker.nothingUnstaked",
  teamWithdrawWait: "admin.sequence.blocker.withdrawWait",
  endowmentNothingUnstaked: "admin.sequence.blocker.nothingUnstaked",
  endowmentWithdrawWait: "admin.sequence.blocker.withdrawWait",
  endowmentPoolInUse: "admin.sequence.blocker.endowmentPoolInUse",
  endowmentNoPool: "admin.sequence.blocker.endowmentNoPool",
  endowmentNoDelegations: "admin.sequence.blocker.endowmentNoDelegations",
};

function actionBalance(
  id: NodeSequenceActionId,
  balances: NodeSequenceBalances,
  snapshotVote: SnapshotVote | null | undefined,
  format: (yocto: bigint) => string,
  translate: ReturnType<typeof useAppTranslation>,
): string | null {
  if (id === "team-stake")
    return translate("admin.sequence.balance.staked", { amount: format(balances.teamStaked) });
  if (id === "team-house-of-stake")
    return translate("admin.sequence.balance.locked", { amount: format(balances.teamLocked) });
  if (id === "endowment-stake") {
    return translate("admin.sequence.balance.lockupStaked", {
      lockup: format(balances.endowmentInLockup),
      staked: format(balances.endowmentStaked),
    });
  }
  if (id === "team-vote") {
    if (snapshotVote === undefined) {
      return translate("admin.sequence.balance.votingPower", {
        amount: format(balances.teamVotingPower),
      });
    }
    if (!snapshotVote) return null;
    const block = String(snapshotVote.snapshot.blockHeight);
    return snapshotVote.votingPower === 0n
      ? translate("admin.sequence.balance.noSnapshotPower", { block })
      : translate("admin.sequence.balance.snapshotVotingPower", {
          amount: format(snapshotVote.votingPower),
          block,
        });
  }
  if (id === "team-unwind") {
    return translate("admin.sequence.balance.stakedUnstaked", {
      staked: format(balances.teamStaked),
      unstaked: format(balances.teamUnstaked),
    });
  }
  if (id === "endowment-unwind") {
    return translate("admin.sequence.balance.stakedUnstaked", {
      staked: format(balances.endowmentStaked),
      unstaked: format(balances.endowmentUnstaked),
    });
  }
  return null;
}

const SEQUENCE_KEY = ["node-staking-sequence"] as const;

function snapshotVoteQueryOptions(team: string, proposalId: number | null) {
  return queryOptions({
    queryKey: [...SEQUENCE_KEY, "snapshot-vote", team, proposalId] as const,
    queryFn: () => readTeamSnapshotVote(team, proposalId ?? 0),
    staleTime: (query) => (query.state.data ? 5 * 60_000 : 0),
    refetchInterval: (query) => (query.state.data ? false : 30_000),
    retry: 1,
  });
}

export function NodeStakingSequence({
  nodeId,
  tenantId,
  savedEndowment,
  validators,
}: {
  nodeId: string;
  tenantId: string | null;
  savedEndowment: string;
  validators: readonly Validator[];
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const sessionAccount = useNearAccount();
  const [endowmentInput, setEndowmentInput] = useState(savedEndowment);
  const [teamStake, setTeamStake] = useState("1");
  const [endowmentFund, setEndowmentFund] = useState("");
  const [endowmentStake, setEndowmentStake] = useState("");
  const [voteProposal, setVoteProposal] = useState<string | null>(null);

  const tenantQuery = useQuery(tenantByIdQueryOptions(apiClient, tenantId ?? ""));
  const team = resolveTeamAccountId({
    tenantAccountId: tenantQuery.data?.accountId,
    tenantOwnerKind: tenantQuery.data?.ownerKind,
  });
  const poolValidator =
    validators.find((validator) => validator.isDefault && validator.network === "mainnet") ??
    validators.find((validator) => validator.network === "mainnet");
  const pool = poolValidator?.accountId ?? "";
  const [endowment, setEndowment] = useState(savedEndowment);
  useEffect(() => {
    const next = endowmentInput.trim().includes(".") ? endowmentInput.trim() : "";
    const timer = setTimeout(() => setEndowment(next), 400);
    return () => clearTimeout(timer);
  }, [endowmentInput]);
  const voteProposalId = voteProposal == null ? null : Number(voteProposal);

  const chainQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "chain", team, endowment, pool],
    queryFn: () => readNodeSequenceChain({ team, endowment, pool }),
    enabled: !!team,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  const votedQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "voted", team, voteProposalId],
    queryFn: () => readTeamVote(team, voteProposalId ?? 0),
    enabled: !!team && voteProposalId != null,
  });
  const snapshotQuery = useQuery({
    ...snapshotVoteQueryOptions(team, voteProposalId),
    enabled: !!team && voteProposalId != null,
  });
  const [teamProposalsQuery, endowmentProposalsQuery] = useQueries({
    queries: [team, endowment].map((dao) => ({
      queryKey: [...SEQUENCE_KEY, "proposals", dao],
      queryFn: () => readOpenDaoProposals(dao),
      enabled: !!team && !!dao,
      refetchInterval: 15_000,
    })),
  });
  const proposalsQueries = { team: teamProposalsQuery, endowment: endowmentProposalsQuery };
  const policiesQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "policies", team, endowment],
    queryFn: async () => {
      const [teamPolicy, endowmentPolicy] = await Promise.all([
        fetchSputnikPolicy(team),
        endowment ? fetchSputnikPolicy(endowment) : null,
      ]);
      return { team: teamPolicy, endowment: endowmentPolicy };
    },
    enabled: !!team,
    staleTime: 60_000,
  });
  const govQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "gov-proposals"],
    queryFn: readActiveGovProposals,
    enabled: !!team,
    staleTime: 60_000,
  });

  const treasuryAccount = (treasury: NodeTreasury) => (treasury === "team" ? team : endowment);

  const mutation = useMutation({
    mutationFn: async ({ step, title }: { step: NodeSequenceStep; title: string }) => {
      const dao = treasuryAccount(step.treasury);
      if (!dao) throw new AppActionError("admin.sequence.needEndowment");
      let plan: DaoPlan | null = step.plan;
      const voteOption = voteStepOption(step.id);
      if (voteOption) {
        if (voteProposalId == null) throw new AppActionError("admin.sequence.pickVote");
        const [snapshotVote, storageFee] = await Promise.all([
          queryClient.fetchQuery(snapshotVoteQueryOptions(team, voteProposalId)).catch(() => {
            throw new AppActionError("admin.sequence.snapshotError");
          }),
          readVoteStorageFee(),
        ]);
        if (!snapshotVote) throw new AppActionError("admin.sequence.noSnapshot");
        if (!snapshotVote.proof) {
          throw new AppActionError("admin.sequence.noProofNamed", { account: team });
        }
        plan = buildVotePlan({
          proposalId: voteProposalId,
          option: voteOption,
          proof: snapshotVote.proof,
          storageFee,
        });
      }
      if (!plan) throw new AppActionError("admin.sequence.needsInput");
      await requireApprovedStakeStep(queryClient, apiClient, { treasury: step.treasury, plan });
      await proposeAsSession(
        auth.near,
        dao,
        plan,
        proposalDescription(title, describePlanCall(plan)),
      );
      return dao;
    },
    onSuccess: async (dao) => {
      await queryClient.invalidateQueries({ queryKey: SEQUENCE_KEY });
      toast.success(translate("admin.sequence.proposedNamed", { dao }));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const saveEndowment = useMutation({
    mutationFn: async (value: string) => {
      const latest = await apiClient.getNode({ nodeId });
      await apiClient.updateNode({
        nodeId,
        metadata: withEndowment(latest?.metadata ?? {}, value),
      });
    },
    onSuccess: async () => {
      await invalidateNodeQueries(queryClient);
      toast.success(translate("admin.sequence.endowmentSaved"));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  if (tenantId && tenantQuery.isLoading) {
    return <Notice title={translate("admin.sequence.readingChain")} />;
  }
  if (!team) {
    return <Notice title={translate("admin.sequence.noTeam")} />;
  }
  if (!pool) {
    return <Notice title={translate("admin.sequence.noPool")} />;
  }

  const teamStakeYocto = parseNearAmount(teamStake);
  const endowmentFundYocto = parseNearAmount(endowmentFund);
  const endowmentStakeYocto = parseNearAmount(endowmentStake);
  const actions = buildNodeSequence(
    { team, endowment, pool, teamStakeYocto, endowmentFundYocto, endowmentStakeYocto },
    {
      ...(chainQuery.data ?? EMPTY_CHAIN),
      teamVote: votedQuery.data ?? null,
      teamSnapshotPower: snapshotQuery.data?.votingPower ?? null,
    },
  );
  const amountMissing: Partial<Record<NodeSequenceStepId, boolean>> = {
    stake: !teamStakeYocto,
    "fund-lockup": !endowmentFundYocto,
    "stake-endowment": !endowmentStakeYocto,
  };
  const balances = nodeSequenceBalances(chainQuery.data ?? EMPTY_CHAIN);
  const formatYocto = (yocto: bigint) => formatNearBalance(yocto, locale);
  const chainPending =
    chainQuery.isPlaceholderData ||
    chainQuery.isLoading ||
    endowment !== (endowmentInput.trim().includes(".") ? endowmentInput.trim() : "");
  const govItems = (govQuery.data ?? []).map((proposal) => ({
    value: String(proposal.id),
    label: `#${proposal.id} ${proposal.title ?? ""}`.trim(),
  }));
  const proposals = {
    team: teamProposalsQuery?.data ?? [],
    endowment: endowmentProposalsQuery?.data ?? [],
  };
  const canPropose = (treasury: NodeTreasury) => {
    const policy = policiesQuery.data?.[treasury];
    return policy ? canAccountPropose(policy, sessionAccount) : true;
  };

  const voteBlocker = (step: NodeSequenceStep): string | null => {
    const blocker = step.blocker ? translate(BLOCKER_LABELS[step.blocker]) : null;
    if (voteProposalId == null) return blocker ?? translate("admin.sequence.pickVote");
    if (snapshotQuery.isError) return translate("admin.sequence.snapshotError");
    if (snapshotQuery.isPending) return translate("admin.sequence.readingSnapshot");
    if (!snapshotQuery.data) return translate("admin.sequence.noSnapshot");
    return blocker;
  };

  const stepBlocker = (step: NodeSequenceStep): string | null => {
    if (!sessionAccount) return translate("admin.sequence.signIn");
    if (step.treasury === "endowment" && !endowment) {
      return translate("admin.sequence.needEndowment");
    }
    if (step.treasury === "endowment" && endowment === team) {
      return translate("admin.sequence.sharedTreasury");
    }
    if (!canPropose(step.treasury)) {
      return translate("admin.sequence.cannotProposeNamed", {
        account: sessionAccount,
        dao: treasuryAccount(step.treasury),
      });
    }
    if (chainQuery.isError) return translate("admin.sequence.chainError");
    const proposalsQuery = proposalsQueries[step.treasury];
    if (proposalsQuery?.isError) return translate("admin.sequence.proposalsError");
    if (chainPending || proposalsQuery?.isPending) return translate("admin.sequence.readingChain");
    if (voteStepOption(step.id)) return voteBlocker(step);
    if (step.blocker) return translate(BLOCKER_LABELS[step.blocker]);
    if (step.plan) return null;
    return amountMissing[step.id]
      ? translate("admin.sequence.needsInput")
      : translate("admin.sequence.readingChain");
  };

  const actionInputs: Partial<Record<NodeSequenceActionId, ReactNode>> = {
    "team-stake": (
      <AmountField
        id="sequence-team-stake"
        label={translate("admin.sequence.stakeAmount")}
        value={teamStake}
        onChange={setTeamStake}
      />
    ),
    "endowment-stake": (
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          id="sequence-endowment-fund"
          label={translate("admin.sequence.fundAmount")}
          value={endowmentFund}
          onChange={setEndowmentFund}
        />
        <AmountField
          id="sequence-endowment-stake"
          label={translate("admin.sequence.lockupStakeAmount")}
          value={endowmentStake}
          onChange={setEndowmentStake}
        />
      </div>
    ),
    "team-vote": (
      <Field>
        <FieldLabel htmlFor="sequence-vote-proposal">
          {translate("admin.sequence.voteProposal")}
        </FieldLabel>
        <Select
          value={voteProposal}
          items={govItems}
          onValueChange={(value) => setVoteProposal(value)}
        >
          <SelectTrigger id="sequence-vote-proposal" className="w-full">
            <SelectValue placeholder={translate("admin.sequence.pickVote")} />
          </SelectTrigger>
          <SelectContent>
            {govItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {govQuery.isSuccess && govQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {translate("admin.sequence.noActiveVotes")}
          </p>
        )}
      </Field>
    ),
  };

  return (
    <section className="flex flex-col gap-6" data-testid="admin-node-sequence">
      <SectionHeader
        title={translate("admin.sequence.title")}
        description={translate("admin.sequence.description")}
      />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-3">
          <TreasuryField label={translate("admin.sequence.teamTreasury")} account={team} />
          <TreasuryField label={translate("admin.sequence.pool")} account={pool} />
          <Field>
            <FieldLabel htmlFor="sequence-endowment">
              {translate("admin.sequence.endowmentTreasury")}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="sequence-endowment"
                value={endowmentInput}
                onChange={(event) => setEndowmentInput(event.target.value)}
                placeholder="endowment.sputnik-dao.near"
                className="font-mono"
                data-testid="admin-node-sequence-endowment"
              />
              {endowmentInput.trim() !== savedEndowment && (
                <Button
                  variant="outline"
                  disabled={saveEndowment.isPending}
                  onClick={() => saveEndowment.mutate(endowmentInput.trim())}
                  data-testid="admin-node-sequence-save-endowment"
                >
                  {translate("common.save")}
                </Button>
              )}
            </div>
          </Field>
        </div>
      </FieldGroup>
      {!sessionAccount && (
        <p className="text-sm text-muted-foreground">{translate("admin.sequence.signIn")}</p>
      )}
      <div className="flex flex-col gap-6">
        {actions.map((action, index) => (
          <div
            key={action.id}
            className="flex flex-col gap-4 rounded-2xl border border-border p-4"
            data-testid={`admin-node-sequence-${action.id}`}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-foreground">
                {index + 1}. {translate(ACTION_TITLES[action.id])}
              </h3>
              <p className="text-sm text-muted-foreground">
                {translate(ACTION_HINTS[action.id], {
                  dao:
                    treasuryAccount(action.treasury) ||
                    translate("admin.sequence.endowmentTreasury"),
                })}
              </p>
              {chainQuery.data && (
                <p
                  className="text-sm text-foreground"
                  data-testid={`admin-node-sequence-balance-${action.id}`}
                >
                  {actionBalance(
                    action.id,
                    balances,
                    voteProposalId == null ? undefined : (snapshotQuery.data ?? null),
                    formatYocto,
                    translate,
                  )}
                </p>
              )}
            </div>
            {actionInputs[action.id]}
            <ItemGroup>
              {action.steps.map((step) => {
                const voteOption = voteStepOption(step.id);
                const pending = voteOption
                  ? pendingVoteProposalFor(proposals[step.treasury], voteProposalId, voteOption)
                  : pendingProposalFor(proposals[step.treasury], step.plan);
                const blocker = stepBlocker(step);
                const title = translate(STEP_LABELS[step.id]);
                const dao = treasuryAccount(step.treasury);
                return (
                  <Item
                    key={step.id}
                    variant="muted"
                    size="sm"
                    data-testid={`admin-node-sequence-step-${step.id}`}
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full">{title}</ItemTitle>
                      {step.plan && (
                        <ItemDescription className="font-mono break-all">
                          {describePlanCall(step.plan)}
                        </ItemDescription>
                      )}
                      {!step.done && !pending && blocker && (
                        <ItemDescription>{blocker}</ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions>
                      {step.done ? (
                        <Badge variant="success">
                          <CheckCircleIcon />
                          {translate("admin.sequence.done")}
                        </Badge>
                      ) : pending ? (
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={
                            <a href={trezuDaoUrl(dao)} target="_blank" rel="noopener noreferrer">
                              <ClockIcon />
                              {translate("admin.sequence.pendingNamed", { id: pending.id })}
                              <ArrowSquareOutIcon data-icon="inline-end" />
                            </a>
                          }
                        />
                      ) : (
                        <Button
                          size="sm"
                          disabled={!!blocker || mutation.isPending}
                          onClick={() => mutation.mutate({ step, title })}
                          data-testid={`admin-node-sequence-propose-${step.id}`}
                        >
                          {translate("admin.sequence.propose")}
                        </Button>
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </div>
        ))}
      </div>
    </section>
  );
}

function Notice({ title }: { title: string }) {
  return <p className="text-sm text-muted-foreground">{title}</p>;
}

function TreasuryField({ label, account }: { label: string; account: string }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <p className="font-mono text-sm break-all text-foreground">{account}</p>
    </Field>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="font-mono"
      />
    </Field>
  );
}

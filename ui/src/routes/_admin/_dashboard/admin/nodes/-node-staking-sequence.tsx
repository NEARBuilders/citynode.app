import { ArrowSquareOutIcon, CheckCircleIcon, ClockIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
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
import { useAppTranslation } from "@/i18n/runtime";
import { parseNearAmount } from "@/lib/near-amount";
import {
  buildNodeSequence,
  buildVotePlan,
  describePlanCall,
  EMPTY_CHAIN,
  type NodeSequenceActionId,
  type NodeSequenceStep,
  type NodeSequenceStepId,
  type NodeTreasury,
  pendingProposalFor,
  proposalDescription,
  readActiveGovProposals,
  readGovProof,
  readNodeSequenceChain,
  readVoteStorageFee,
  VOTE_OPTIONS,
  type VoteOption,
} from "@/lib/node-staking-proposals";
import { resolveTeamAccountId } from "@/lib/queries/stake-pool";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import {
  canAccountPropose,
  type DaoPlan,
  fetchDaoProposals,
  fetchSputnikPolicy,
  proposeAsSession,
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
};

const ACTION_HINTS: Record<NodeSequenceActionId, AppMessageId> = {
  "team-stake": "admin.sequence.teamStakeHint",
  "team-house-of-stake": "admin.sequence.teamHosHint",
  "endowment-stake": "admin.sequence.endowmentStakeHint",
  "endowment-delegate": "admin.sequence.endowmentDelegateHint",
  "team-vote": "admin.sequence.teamVoteHint",
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
  vote: "admin.sequence.step.vote",
};

const VOTE_LABELS: Record<VoteOption, AppMessageId> = {
  For: "admin.sequence.voteFor",
  Against: "admin.sequence.voteAgainst",
  Abstain: "admin.sequence.voteAbstain",
};

const SEQUENCE_KEY = ["node-staking-sequence"] as const;

export function NodeStakingSequence({
  tenantId,
  validators,
}: {
  tenantId: string | null;
  validators: readonly Validator[];
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const sessionAccount = useNearAccount();
  const [endowmentInput, setEndowmentInput] = useState("");
  const [teamStake, setTeamStake] = useState("1");
  const [endowmentFund, setEndowmentFund] = useState("");
  const [endowmentStake, setEndowmentStake] = useState("");
  const [voteProposal, setVoteProposal] = useState<string | null>(null);
  const [voteOption, setVoteOption] = useState<VoteOption>("For");

  const tenantQuery = useQuery(tenantByIdQueryOptions(apiClient, tenantId ?? ""));
  const team = resolveTeamAccountId({
    tenantAccountId: tenantQuery.data?.accountId,
    tenantOwnerKind: tenantQuery.data?.ownerKind,
  });
  const poolValidator =
    validators.find((validator) => validator.isDefault && validator.network === "mainnet") ??
    validators.find((validator) => validator.network === "mainnet");
  const pool = poolValidator?.accountId ?? "";
  const endowment = endowmentInput.trim().includes(".") ? endowmentInput.trim() : "";
  const voteProposalId = voteProposal == null ? null : Number(voteProposal);

  const chainQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "chain", team, endowment, pool, voteProposalId],
    queryFn: () => readNodeSequenceChain({ team, endowment, pool, voteProposalId }),
    enabled: !!team,
    staleTime: 15_000,
  });
  const proposalsQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "proposals", team, endowment],
    queryFn: async () => ({
      team: team ? await fetchDaoProposals(team) : [],
      endowment: endowment ? await fetchDaoProposals(endowment) : [],
    }),
    enabled: !!team,
    refetchInterval: 15_000,
  });
  const policiesQuery = useQuery({
    queryKey: [...SEQUENCE_KEY, "policies", team, endowment],
    queryFn: async () => ({
      team: team ? await fetchSputnikPolicy(team) : null,
      endowment: endowment ? await fetchSputnikPolicy(endowment) : null,
    }),
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
      if (step.id === "vote") {
        if (voteProposalId == null) throw new AppActionError("admin.sequence.pickVote");
        const [proof, storageFee] = await Promise.all([readGovProof(team), readVoteStorageFee()]);
        if (!proof) throw new AppActionError("admin.sequence.noProofNamed", { account: team });
        plan = buildVotePlan({ proposalId: voteProposalId, option: voteOption, proof, storageFee });
      }
      if (!plan) throw new AppActionError("admin.sequence.needsInput");
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

  if (!tenantId || (tenantQuery.isSuccess && !team)) {
    return <Notice title={translate("admin.sequence.noTeam")} />;
  }
  if (!pool) {
    return <Notice title={translate("admin.sequence.noPool")} />;
  }

  const actions = buildNodeSequence(
    {
      team,
      endowment,
      pool,
      teamStakeYocto: parseNearAmount(teamStake),
      endowmentFundYocto: parseNearAmount(endowmentFund),
      endowmentStakeYocto: parseNearAmount(endowmentStake),
    },
    chainQuery.data ?? EMPTY_CHAIN,
  );
  const proposals = proposalsQuery.data ?? { team: [], endowment: [] };
  const canPropose = (treasury: NodeTreasury) => {
    const policy = policiesQuery.data?.[treasury];
    return policy ? canAccountPropose(policy, sessionAccount) : true;
  };

  const stepBlocker = (step: NodeSequenceStep): string | null => {
    if (!sessionAccount) return translate("admin.sequence.signIn");
    if (step.treasury === "endowment" && !endowment) {
      return translate("admin.sequence.needEndowment");
    }
    if (!canPropose(step.treasury)) {
      return translate("admin.sequence.cannotProposeNamed", {
        account: sessionAccount,
        dao: treasuryAccount(step.treasury),
      });
    }
    if (step.id === "vote")
      return voteProposalId == null ? translate("admin.sequence.pickVote") : null;
    return step.plan ? null : translate("admin.sequence.needsInput");
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="sequence-vote-proposal">
            {translate("admin.sequence.voteProposal")}
          </FieldLabel>
          <Select value={voteProposal} onValueChange={(value) => setVoteProposal(value)}>
            <SelectTrigger id="sequence-vote-proposal" className="w-full">
              <SelectValue placeholder={translate("admin.sequence.pickVote")} />
            </SelectTrigger>
            <SelectContent>
              {(govQuery.data ?? []).map((proposal) => (
                <SelectItem key={proposal.id} value={String(proposal.id)}>
                  #{proposal.id} {proposal.title ?? ""}
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
        <Field>
          <FieldLabel htmlFor="sequence-vote-option">
            {translate("admin.sequence.voteOption")}
          </FieldLabel>
          <Select
            value={voteOption}
            onValueChange={(value) =>
              setVoteOption(VOTE_OPTIONS.find((option) => option === value) ?? "For")
            }
          >
            <SelectTrigger id="sequence-vote-option" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOTE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {translate(VOTE_LABELS[option])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
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
            <Input
              id="sequence-endowment"
              value={endowmentInput}
              onChange={(event) => setEndowmentInput(event.target.value)}
              placeholder="endowment.sputnik-dao.near"
              className="font-mono"
              data-testid="admin-node-sequence-endowment"
            />
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
            </div>
            {actionInputs[action.id]}
            <ItemGroup>
              {action.steps.map((step) => {
                const pending = pendingProposalFor(proposals[step.treasury], step.plan);
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

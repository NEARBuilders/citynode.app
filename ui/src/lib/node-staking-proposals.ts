import {
  type DaoPlan,
  findPendingProposalForPlan,
  getNear,
  isPendingProposal,
  proposalCallsMethod,
  type SputnikProposal,
} from "@/lib/sputnik-proposals";

export const VENEAR_ACCOUNT = "venear.dao";
export const VOTING_ACCOUNT = "vote.dao";
export const REGISTER_DEPOSIT = "100000000000000000000000";
export const LOCKUP_DEPLOY_DEPOSIT = "2000000000000000000000000";
export const DELEGATE_DEPOSIT = "100000000000000000000000";
export const VOTE_STORAGE_FEE_FALLBACK = "1250000000000000000000";
export const ONE_YOCTO = "1";
export const FULL_DELEGATION_BPS = 10_000;
export const ACTIVE_VOTE_STATUSES = ["Voting", "Sandbox", "Created"];
export const VOTE_OPTIONS = ["For", "Against", "Abstain"] as const;
export const ENDOWMENT_METADATA_KEY = "endowmentAccountId";

export type VoteOption = (typeof VOTE_OPTIONS)[number];
export type NodeTreasury = "team" | "endowment";

export type NodeSequenceActionId =
  | "team-stake"
  | "team-house-of-stake"
  | "endowment-stake"
  | "endowment-delegate"
  | "team-vote"
  | "team-unwind"
  | "endowment-unwind";

export type NodeVoteStepId = "vote-for" | "vote-against" | "vote-abstain";

export type NodeSequenceStepId =
  | "stake"
  | "register"
  | "deploy-lockup"
  | "lock"
  | "register-endowment"
  | "deploy-lockup-endowment"
  | "fund-lockup"
  | "lock-endowment"
  | "unselect-old-pool"
  | "select-pool"
  | "stake-endowment"
  | "set-delegations"
  | NodeVoteStepId
  | "unstake-team"
  | "withdraw-team"
  | "unstake-endowment"
  | "withdraw-endowment"
  | "release-pool"
  | "clear-delegations";

export const VOTE_STEP_OPTIONS: Record<NodeVoteStepId, VoteOption> = {
  "vote-for": "For",
  "vote-against": "Against",
  "vote-abstain": "Abstain",
};

export function voteStepOption(id: NodeSequenceStepId): VoteOption | null {
  return id in VOTE_STEP_OPTIONS ? VOTE_STEP_OPTIONS[id as NodeVoteStepId] : null;
}

export type NodeSequenceBlocker =
  | "teamNotRegistered"
  | "teamNoLockup"
  | "teamNothingToLock"
  | "endowmentNotRegistered"
  | "endowmentNoLockup"
  | "endowmentNotFunded"
  | "endowmentOtherPool"
  | "endowmentPoolNotSelected"
  | "endowmentNotLocked"
  | "endowmentNotStaked"
  | "teamNoVotingPower"
  | "teamNotStaked"
  | "teamNothingUnstaked"
  | "teamWithdrawWait"
  | "endowmentNothingUnstaked"
  | "endowmentWithdrawWait"
  | "endowmentPoolInUse"
  | "endowmentNoPool"
  | "endowmentNoDelegations";

export interface VenearBalanceView {
  near_balance: string;
  extra_venear_balance: string;
}

export interface VenearAccountView {
  account: {
    account_id: string;
    balance?: VenearBalanceView;
    delegated_balance?: VenearBalanceView;
    delegations: { account_id: string; bps: number }[];
  };
  internal: { lockup_version: number | null };
}

export interface LockupState {
  liquid: string;
  locked: string;
  stakingPool: string | null;
  knownDeposited: string;
}

export interface PoolAccount {
  staked: bigint;
  unstaked: bigint;
  canWithdraw: boolean;
}

export interface NodeSequenceChain {
  teamLockup: string | null;
  endowmentLockup: string | null;
  teamVenear: VenearAccountView | null;
  endowmentVenear: VenearAccountView | null;
  teamLockupState: LockupState | null;
  endowmentLockupState: LockupState | null;
  teamPool: PoolAccount | null;
  endowmentPool: PoolAccount | null;
  teamVote: VoteOption | null;
}

export interface NodeSequenceInputs {
  team: string;
  endowment: string;
  pool: string;
  teamStakeYocto: bigint | null;
  endowmentFundYocto: bigint | null;
  endowmentStakeYocto: bigint | null;
}

export interface NodeSequenceStep {
  id: NodeSequenceStepId;
  treasury: NodeTreasury;
  plan: DaoPlan | null;
  done: boolean;
  blocker: NodeSequenceBlocker | null;
}

export interface NodeSequenceAction {
  id: NodeSequenceActionId;
  treasury: NodeTreasury;
  steps: NodeSequenceStep[];
}

export interface NodeSequenceBalances {
  teamStaked: bigint;
  teamUnstaked: bigint;
  teamLocked: bigint;
  teamVotingPower: bigint;
  endowmentInLockup: bigint;
  endowmentStaked: bigint;
  endowmentUnstaked: bigint;
}

export const EMPTY_CHAIN: NodeSequenceChain = {
  teamLockup: null,
  endowmentLockup: null,
  teamVenear: null,
  endowmentVenear: null,
  teamLockupState: null,
  endowmentLockupState: null,
  teamPool: null,
  endowmentPool: null,
  teamVote: null,
};

export function yoctoOf(value: string | null | undefined): bigint {
  try {
    return value ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

function call(
  receiverId: string,
  methodName: string,
  gas: string,
  attachedDeposit?: string,
  args: Record<string, unknown> = {},
): DaoPlan {
  return { kind: "call", receiverId, methodName, args, gas, attachedDeposit };
}

function firstBlocker(...checks: [boolean, NodeSequenceBlocker][]): NodeSequenceBlocker | null {
  return checks.find(([blocked]) => blocked)?.[1] ?? null;
}

export function nodeSequenceBalances(chain: NodeSequenceChain): NodeSequenceBalances {
  const venear = chain.teamVenear?.account;
  return {
    teamStaked: chain.teamPool?.staked ?? 0n,
    teamUnstaked: chain.teamPool?.unstaked ?? 0n,
    teamLocked: yoctoOf(chain.teamLockupState?.locked),
    teamVotingPower:
      yoctoOf(venear?.balance?.near_balance) + yoctoOf(venear?.delegated_balance?.near_balance),
    endowmentInLockup:
      yoctoOf(chain.endowmentLockupState?.liquid) + yoctoOf(chain.endowmentLockupState?.locked),
    endowmentStaked: chain.endowmentPool?.staked ?? 0n,
    endowmentUnstaked: chain.endowmentPool?.unstaked ?? 0n,
  };
}

export function buildNodeSequence(
  inputs: NodeSequenceInputs,
  chain: NodeSequenceChain,
): NodeSequenceAction[] {
  const { team, pool, teamStakeYocto, endowmentFundYocto, endowmentStakeYocto } = inputs;
  const balances = nodeSequenceBalances(chain);
  const teamLockup = chain.teamLockup ?? "";
  const endowmentLockup = chain.endowmentLockup ?? "";
  const teamRegistered = chain.teamVenear != null;
  const teamLockupDeployed = chain.teamVenear?.internal.lockup_version != null;
  const teamLiquid = yoctoOf(chain.teamLockupState?.liquid);
  const endowmentRegistered = chain.endowmentVenear != null;
  const endowmentLockupDeployed = chain.endowmentVenear?.internal.lockup_version != null;
  const endowmentLiquid = yoctoOf(chain.endowmentLockupState?.liquid);
  const endowmentLocked = yoctoOf(chain.endowmentLockupState?.locked);
  const endowmentStakedAny =
    yoctoOf(chain.endowmentLockupState?.knownDeposited) > 0n || balances.endowmentStaked > 0n;
  const selectedPool = chain.endowmentLockupState?.stakingPool ?? null;
  const selectedPoolInUse = balances.endowmentStaked > 0n || balances.endowmentUnstaked > 0n;
  const delegations = chain.endowmentVenear?.account.delegations ?? [];

  const lockupCall = (methodName: string, gas: string, args: Record<string, unknown> = {}) =>
    endowmentLockup ? call(endowmentLockup, methodName, gas, ONE_YOCTO, args) : null;

  return [
    {
      id: "team-stake",
      treasury: "team",
      steps: [
        {
          id: "stake",
          treasury: "team",
          plan:
            pool && teamStakeYocto
              ? call(pool, "deposit_and_stake", "200 Tgas", teamStakeYocto.toString())
              : null,
          done: false,
          blocker: null,
        },
      ],
    },
    {
      id: "team-house-of-stake",
      treasury: "team",
      steps: [
        {
          id: "register",
          treasury: "team",
          plan: call(VENEAR_ACCOUNT, "storage_deposit", "30 Tgas", REGISTER_DEPOSIT),
          done: teamRegistered,
          blocker: null,
        },
        {
          id: "deploy-lockup",
          treasury: "team",
          plan: call(VENEAR_ACCOUNT, "deploy_lockup", "100 Tgas", LOCKUP_DEPLOY_DEPOSIT),
          done: teamLockupDeployed,
          blocker: firstBlocker([!teamRegistered, "teamNotRegistered"]),
        },
        {
          id: "lock",
          treasury: "team",
          plan: teamLockup ? call(teamLockup, "lock_near", "100 Tgas", ONE_YOCTO) : null,
          done: balances.teamLocked > 0n && teamLiquid === 0n,
          blocker: firstBlocker(
            [!teamLockupDeployed, "teamNoLockup"],
            [teamLiquid === 0n, "teamNothingToLock"],
          ),
        },
      ],
    },
    {
      id: "endowment-stake",
      treasury: "endowment",
      steps: [
        {
          id: "register-endowment",
          treasury: "endowment",
          plan: call(VENEAR_ACCOUNT, "storage_deposit", "30 Tgas", REGISTER_DEPOSIT),
          done: endowmentRegistered,
          blocker: null,
        },
        {
          id: "deploy-lockup-endowment",
          treasury: "endowment",
          plan: call(VENEAR_ACCOUNT, "deploy_lockup", "100 Tgas", LOCKUP_DEPLOY_DEPOSIT),
          done: endowmentLockupDeployed,
          blocker: firstBlocker([!endowmentRegistered, "endowmentNotRegistered"]),
        },
        {
          id: "fund-lockup",
          treasury: "endowment",
          plan:
            endowmentLockup && endowmentFundYocto
              ? {
                  kind: "transfer",
                  receiverId: endowmentLockup,
                  amountYocto: endowmentFundYocto.toString(),
                }
              : null,
          done: false,
          blocker: firstBlocker([!endowmentLockupDeployed, "endowmentNoLockup"]),
        },
        {
          id: "lock-endowment",
          treasury: "endowment",
          plan: lockupCall("lock_near", "100 Tgas"),
          done: endowmentLocked > 0n && endowmentLiquid === 0n,
          blocker: firstBlocker(
            [!endowmentLockupDeployed, "endowmentNoLockup"],
            [endowmentLiquid === 0n, "endowmentNotFunded"],
          ),
        },
        ...(selectedPool && selectedPool !== pool
          ? [
              {
                id: "unselect-old-pool" as const,
                treasury: "endowment" as const,
                plan: lockupCall("unselect_staking_pool", "25 Tgas"),
                done: false,
                blocker: firstBlocker([selectedPoolInUse, "endowmentPoolInUse"]),
              },
            ]
          : []),
        {
          id: "select-pool",
          treasury: "endowment",
          plan: pool
            ? lockupCall("select_staking_pool", "75 Tgas", { staking_pool_account_id: pool })
            : null,
          done: !!pool && selectedPool === pool,
          blocker: firstBlocker(
            [!endowmentLockupDeployed, "endowmentNoLockup"],
            [!!selectedPool && selectedPool !== pool, "endowmentOtherPool"],
          ),
        },
        {
          id: "stake-endowment",
          treasury: "endowment",
          plan: endowmentStakeYocto
            ? lockupCall("deposit_and_stake", "125 Tgas", {
                amount: endowmentStakeYocto.toString(),
              })
            : null,
          done: false,
          blocker: firstBlocker(
            [selectedPool !== pool, "endowmentPoolNotSelected"],
            [endowmentLiquid + endowmentLocked === 0n, "endowmentNotFunded"],
          ),
        },
      ],
    },
    {
      id: "endowment-delegate",
      treasury: "endowment",
      steps: [
        {
          id: "set-delegations",
          treasury: "endowment",
          plan: team
            ? call(VENEAR_ACCOUNT, "set_delegations", "100 Tgas", DELEGATE_DEPOSIT, {
                entries: [{ account_id: team, bps: FULL_DELEGATION_BPS }],
              })
            : null,
          done: delegations.some(
            (entry) => entry.account_id === team && entry.bps === FULL_DELEGATION_BPS,
          ),
          blocker: firstBlocker(
            [!teamRegistered, "teamNotRegistered"],
            [endowmentLocked === 0n, "endowmentNotLocked"],
            [!endowmentStakedAny, "endowmentNotStaked"],
          ),
        },
      ],
    },
    {
      id: "team-vote",
      treasury: "team",
      steps: [
        {
          id: "vote-for",
          treasury: "team",
          plan: null,
          done: chain.teamVote === "For",
          blocker: firstBlocker([balances.teamVotingPower === 0n, "teamNoVotingPower"]),
        },
        {
          id: "vote-against",
          treasury: "team",
          plan: null,
          done: chain.teamVote === "Against",
          blocker: firstBlocker([balances.teamVotingPower === 0n, "teamNoVotingPower"]),
        },
        {
          id: "vote-abstain",
          treasury: "team",
          plan: null,
          done: chain.teamVote === "Abstain",
          blocker: firstBlocker([balances.teamVotingPower === 0n, "teamNoVotingPower"]),
        },
      ],
    },
    {
      id: "team-unwind",
      treasury: "team",
      steps: [
        {
          id: "unstake-team",
          treasury: "team",
          plan: pool ? call(pool, "unstake_all", "125 Tgas") : null,
          done: false,
          blocker: firstBlocker([balances.teamStaked === 0n, "teamNotStaked"]),
        },
        {
          id: "withdraw-team",
          treasury: "team",
          plan: pool ? call(pool, "withdraw_all", "125 Tgas") : null,
          done: false,
          blocker: firstBlocker(
            [balances.teamUnstaked === 0n, "teamNothingUnstaked"],
            [!chain.teamPool?.canWithdraw, "teamWithdrawWait"],
          ),
        },
      ],
    },
    {
      id: "endowment-unwind",
      treasury: "endowment",
      steps: [
        {
          id: "unstake-endowment",
          treasury: "endowment",
          plan: lockupCall("unstake_all", "125 Tgas"),
          done: false,
          blocker: firstBlocker([balances.endowmentStaked === 0n, "endowmentNotStaked"]),
        },
        {
          id: "withdraw-endowment",
          treasury: "endowment",
          plan: lockupCall("withdraw_all_from_staking_pool", "175 Tgas"),
          done: false,
          blocker: firstBlocker(
            [balances.endowmentUnstaked === 0n, "endowmentNothingUnstaked"],
            [!chain.endowmentPool?.canWithdraw, "endowmentWithdrawWait"],
          ),
        },
        {
          id: "release-pool",
          treasury: "endowment",
          plan: lockupCall("unselect_staking_pool", "25 Tgas"),
          done: false,
          blocker: firstBlocker(
            [!selectedPool, "endowmentNoPool"],
            [selectedPoolInUse, "endowmentPoolInUse"],
          ),
        },
        {
          id: "clear-delegations",
          treasury: "endowment",
          plan: call(VENEAR_ACCOUNT, "set_delegations", "100 Tgas", DELEGATE_DEPOSIT, {
            entries: [],
          }),
          done: false,
          blocker: firstBlocker([delegations.length === 0, "endowmentNoDelegations"]),
        },
      ],
    },
  ];
}

export function buildVotePlan(input: {
  proposalId: number;
  option: VoteOption;
  proof: readonly [unknown, unknown];
  storageFee: string;
}): DaoPlan {
  return call(VOTING_ACCOUNT, "vote", "300 Tgas", input.storageFee, {
    proposal_id: input.proposalId,
    vote: input.option,
    merkle_proof: input.proof[0],
    v_account: input.proof[1],
  });
}

function proposalVote(
  proposal: SputnikProposal,
): { proposalId: number; option: VoteOption } | null {
  const action = (
    proposal.kind as { FunctionCall?: { actions: { method_name: string; args: string }[] } }
  ).FunctionCall?.actions.find((entry) => entry.method_name === "vote");
  if (!action) return null;
  try {
    const args = JSON.parse(atob(action.args)) as { proposal_id?: unknown; vote?: unknown };
    const option = VOTE_OPTIONS.find((entry) => entry === args.vote);
    if (typeof args.proposal_id !== "number" || !option) return null;
    return { proposalId: args.proposal_id, option };
  } catch {
    return null;
  }
}

export function pendingVoteProposalFor(
  proposals: readonly SputnikProposal[],
  proposalId: number | null,
  option: VoteOption,
): SputnikProposal | null {
  if (proposalId == null) return null;
  return (
    proposals.find((proposal) => {
      if (!isPendingProposal(proposal)) return false;
      if (!proposalCallsMethod(proposal, VOTING_ACCOUNT, ["vote"])) return false;
      const parsed = proposalVote(proposal);
      return parsed?.proposalId === proposalId && parsed.option === option;
    }) ?? null
  );
}

function proposalClearsDelegations(proposal: SputnikProposal): boolean | null {
  const action = (
    proposal.kind as { FunctionCall?: { actions: { method_name: string; args: string }[] } }
  ).FunctionCall?.actions.find((entry) => entry.method_name === "set_delegations");
  if (!action) return null;
  try {
    const args = JSON.parse(atob(action.args)) as { entries?: unknown[] };
    return (args.entries ?? []).length === 0;
  } catch {
    return null;
  }
}

export function pendingProposalFor(
  proposals: readonly SputnikProposal[],
  plan: DaoPlan | null,
): SputnikProposal | null {
  if (!plan) return null;
  if (plan.kind === "call" && plan.methodName === "set_delegations") {
    const clearing = ((plan.args.entries as unknown[] | undefined) ?? []).length === 0;
    const matching = proposals.filter(
      (proposal) => proposalClearsDelegations(proposal) === clearing,
    );
    return findPendingProposalForPlan(matching, plan);
  }
  return findPendingProposalForPlan([...proposals], plan);
}

export function proposalDescription(title: string, summary: string): string {
  return `* Title: ${title} <br>* Summary: ${summary}`;
}

export function describePlanCall(plan: DaoPlan): string {
  return plan.kind === "transfer"
    ? `transfer → ${plan.receiverId}`
    : `${plan.receiverId}.${plan.methodName}()`;
}

export function savedEndowmentOf(metadata: Record<string, unknown> | null | undefined): string {
  const value = metadata?.[ENDOWMENT_METADATA_KEY];
  return typeof value === "string" ? value : "";
}

export function withEndowment(
  metadata: Record<string, unknown>,
  endowment: string,
): Record<string, unknown> {
  const next = { ...metadata };
  if (endowment) next[ENDOWMENT_METADATA_KEY] = endowment;
  else delete next[ENDOWMENT_METADATA_KEY];
  return next;
}

function view<T>(accountId: string, method: string, args: Record<string, unknown> = {}) {
  return getNear()
    .view<T>(accountId, method, args)
    .then((result) => result ?? null)
    .catch(() => null);
}

async function readLockupAccountId(accountId: string): Promise<string> {
  const lockup = await getNear().view<string>(VENEAR_ACCOUNT, "get_lockup_account_id", {
    account_id: accountId,
  });
  if (typeof lockup !== "string" || !lockup) {
    throw new Error(`Unreadable lockup account for ${accountId}`);
  }
  return lockup;
}

async function readLockupState(lockup: string | null): Promise<LockupState | null> {
  if (!lockup) return null;
  const [liquid, locked, stakingPool, knownDeposited] = await Promise.all([
    view<string>(lockup, "get_venear_liquid_balance"),
    view<string>(lockup, "get_venear_locked_balance"),
    view<string>(lockup, "get_staking_pool_account_id"),
    view<string>(lockup, "get_known_deposited_balance"),
  ]);
  if (liquid == null && locked == null) return null;
  return {
    liquid: liquid ?? "0",
    locked: locked ?? "0",
    stakingPool: stakingPool ?? null,
    knownDeposited: knownDeposited ?? "0",
  };
}

async function readPoolAccount(pool: string, accountId: string): Promise<PoolAccount | null> {
  const account = await view<{
    staked_balance: string;
    unstaked_balance: string;
    can_withdraw: boolean;
  }>(pool, "get_account", { account_id: accountId });
  if (!account) return null;
  return {
    staked: yoctoOf(account.staked_balance),
    unstaked: yoctoOf(account.unstaked_balance),
    canWithdraw: !!account.can_withdraw,
  };
}

export async function readNodeSequenceChain(input: {
  team: string;
  endowment: string;
  pool: string;
}): Promise<NodeSequenceChain> {
  const { team, endowment, pool } = input;
  const [teamLockup, endowmentLockup, teamVenear, endowmentVenear, teamPool] = await Promise.all([
    team ? readLockupAccountId(team) : null,
    endowment ? readLockupAccountId(endowment) : null,
    team ? view<VenearAccountView>(VENEAR_ACCOUNT, "get_account_info", { account_id: team }) : null,
    endowment
      ? view<VenearAccountView>(VENEAR_ACCOUNT, "get_account_info", { account_id: endowment })
      : null,
    team && pool ? readPoolAccount(pool, team) : null,
  ]);
  const [teamLockupState, endowmentLockupState] = await Promise.all([
    teamVenear?.internal.lockup_version != null ? readLockupState(teamLockup) : null,
    endowmentVenear?.internal.lockup_version != null ? readLockupState(endowmentLockup) : null,
  ]);
  const endowmentPoolId = endowmentLockupState?.stakingPool ?? null;
  const endowmentPool =
    endowmentPoolId && endowmentLockup
      ? await readPoolAccount(endowmentPoolId, endowmentLockup)
      : null;
  return {
    teamLockup,
    endowmentLockup,
    teamVenear,
    endowmentVenear,
    teamLockupState,
    endowmentLockupState,
    teamPool,
    endowmentPool,
    teamVote: null,
  };
}

export async function readTeamVote(team: string, proposalId: number): Promise<VoteOption | null> {
  const vote = await view<number>(VOTING_ACCOUNT, "get_vote", {
    account_id: team,
    proposal_id: proposalId,
  });
  return typeof vote === "number" ? (VOTE_OPTIONS[vote] ?? null) : null;
}

export interface GovProposalView {
  id: number;
  title: string | null;
  status: string;
}

export async function readActiveGovProposals(): Promise<GovProposalView[]> {
  const all =
    (await view<GovProposalView[]>(VOTING_ACCOUNT, "get_proposals", {
      from_index: 0,
      limit: 100,
    })) ?? [];
  return all.filter((proposal) => ACTIVE_VOTE_STATUSES.includes(proposal.status));
}

export async function readVoteStorageFee(): Promise<string> {
  const config = await view<{ vote_storage_fee?: string }>(VOTING_ACCOUNT, "get_config");
  return config?.vote_storage_fee ?? VOTE_STORAGE_FEE_FALLBACK;
}

export function readGovProof(accountId: string) {
  return view<[unknown, unknown]>(VENEAR_ACCOUNT, "get_proof", { account_id: accountId });
}

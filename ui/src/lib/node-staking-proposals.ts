import {
  type DaoPlan,
  findPendingProposalForPlan,
  getNear,
  type SputnikProposal,
} from "@/lib/sputnik-proposals";

export const VENEAR_ACCOUNT = "venear.dao";
export const VOTING_ACCOUNT = "vote.dao";
export const REGISTER_DEPOSIT = "100000000000000000000000";
export const LOCKUP_DEPLOY_DEPOSIT = "2000000000000000000000000";
export const DELEGATE_DEPOSIT = "100000000000000000000000";
export const VOTE_STORAGE_FEE_FALLBACK = "1250000000000000000000";
export const ONE_YOCTO = "1";
export const MIN_TEAM_STAKE_YOCTO = 10n ** 24n;
export const FULL_DELEGATION_BPS = 10_000;
export const ACTIVE_VOTE_STATUSES = ["Voting", "Sandbox", "Created"];
export const VOTE_OPTIONS = ["For", "Against", "Abstain"] as const;

export type VoteOption = (typeof VOTE_OPTIONS)[number];
export type NodeTreasury = "team" | "endowment";
export type NodeSequenceActionId =
  | "team-stake"
  | "team-house-of-stake"
  | "endowment-stake"
  | "endowment-delegate"
  | "team-vote";

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
  | "vote";

export interface VenearAccountView {
  account: {
    account_id: string;
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

export interface NodeSequenceChain {
  teamLockup: string | null;
  endowmentLockup: string | null;
  teamVenear: VenearAccountView | null;
  endowmentVenear: VenearAccountView | null;
  teamLockupState: LockupState | null;
  endowmentLockupState: LockupState | null;
  teamStakedYocto: bigint | null;
  teamVoted: boolean;
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
}

export interface NodeSequenceAction {
  id: NodeSequenceActionId;
  treasury: NodeTreasury;
  steps: NodeSequenceStep[];
}

export const EMPTY_CHAIN: NodeSequenceChain = {
  teamLockup: null,
  endowmentLockup: null,
  teamVenear: null,
  endowmentVenear: null,
  teamLockupState: null,
  endowmentLockupState: null,
  teamStakedYocto: null,
  teamVoted: false,
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

export function buildNodeSequence(
  inputs: NodeSequenceInputs,
  chain: NodeSequenceChain,
): NodeSequenceAction[] {
  const { team, pool, teamStakeYocto, endowmentFundYocto, endowmentStakeYocto } = inputs;
  const teamLockup = chain.teamLockup ?? "";
  const endowmentLockup = chain.endowmentLockup ?? "";
  const endowmentLockupState = chain.endowmentLockupState;
  const selectedPool = endowmentLockupState?.stakingPool ?? null;
  const endowmentHeld =
    yoctoOf(endowmentLockupState?.liquid) + yoctoOf(endowmentLockupState?.locked);

  const endowmentStakeSteps: NodeSequenceStep[] = [
    ...(selectedPool && selectedPool !== pool
      ? [
          {
            id: "unselect-old-pool" as const,
            treasury: "endowment" as const,
            plan: endowmentLockup
              ? call(endowmentLockup, "unselect_staking_pool", "25 Tgas", ONE_YOCTO)
              : null,
            done: false,
          },
        ]
      : []),
    {
      id: "select-pool",
      treasury: "endowment",
      plan:
        endowmentLockup && pool
          ? call(endowmentLockup, "select_staking_pool", "75 Tgas", ONE_YOCTO, {
              staking_pool_account_id: pool,
            })
          : null,
      done: !!pool && selectedPool === pool,
    },
    {
      id: "stake-endowment",
      treasury: "endowment",
      plan:
        endowmentLockup && endowmentStakeYocto
          ? call(endowmentLockup, "deposit_and_stake", "125 Tgas", ONE_YOCTO, {
              amount: endowmentStakeYocto.toString(),
            })
          : null,
      done: yoctoOf(endowmentLockupState?.knownDeposited) > 0n,
    },
  ];

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
          done: (chain.teamStakedYocto ?? 0n) >= MIN_TEAM_STAKE_YOCTO,
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
          done: chain.teamVenear != null,
        },
        {
          id: "deploy-lockup",
          treasury: "team",
          plan: call(VENEAR_ACCOUNT, "deploy_lockup", "100 Tgas", LOCKUP_DEPLOY_DEPOSIT),
          done: chain.teamVenear?.internal.lockup_version != null,
        },
        {
          id: "lock",
          treasury: "team",
          plan: teamLockup ? call(teamLockup, "lock_near", "100 Tgas", ONE_YOCTO) : null,
          done: yoctoOf(chain.teamLockupState?.locked) > 0n,
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
          done: chain.endowmentVenear != null,
        },
        {
          id: "deploy-lockup-endowment",
          treasury: "endowment",
          plan: call(VENEAR_ACCOUNT, "deploy_lockup", "100 Tgas", LOCKUP_DEPLOY_DEPOSIT),
          done: chain.endowmentVenear?.internal.lockup_version != null,
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
          done: endowmentHeld > yoctoOf(LOCKUP_DEPLOY_DEPOSIT),
        },
        {
          id: "lock-endowment",
          treasury: "endowment",
          plan: endowmentLockup ? call(endowmentLockup, "lock_near", "100 Tgas", ONE_YOCTO) : null,
          done: yoctoOf(endowmentLockupState?.locked) > 0n,
        },
        ...endowmentStakeSteps,
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
          done: !!chain.endowmentVenear?.account.delegations.some(
            (entry) => entry.account_id === team && entry.bps === FULL_DELEGATION_BPS,
          ),
        },
      ],
    },
    {
      id: "team-vote",
      treasury: "team",
      steps: [{ id: "vote", treasury: "team", plan: null, done: chain.teamVoted }],
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

export function pendingProposalFor(
  proposals: readonly SputnikProposal[],
  plan: DaoPlan | null,
): SputnikProposal | null {
  return plan ? findPendingProposalForPlan([...proposals], plan) : null;
}

export function proposalDescription(title: string, summary: string): string {
  return `* Title: ${title} <br>* Summary: ${summary}`;
}

export function describePlanCall(plan: DaoPlan): string {
  return plan.kind === "transfer"
    ? `transfer → ${plan.receiverId}`
    : `${plan.receiverId}.${plan.methodName}()`;
}

function view<T>(accountId: string, method: string, args: Record<string, unknown> = {}) {
  return getNear()
    .view<T>(accountId, method, args)
    .then((result) => result ?? null)
    .catch(() => null);
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

export async function readNodeSequenceChain(input: {
  team: string;
  endowment: string;
  pool: string;
  voteProposalId: number | null;
}): Promise<NodeSequenceChain> {
  const { team, endowment, pool, voteProposalId } = input;
  const [teamLockup, endowmentLockup, teamVenear, endowmentVenear, teamPoolStake, teamVote] =
    await Promise.all([
      team ? view<string>(VENEAR_ACCOUNT, "get_lockup_account_id", { account_id: team }) : null,
      endowment
        ? view<string>(VENEAR_ACCOUNT, "get_lockup_account_id", { account_id: endowment })
        : null,
      team
        ? view<VenearAccountView>(VENEAR_ACCOUNT, "get_account_info", { account_id: team })
        : null,
      endowment
        ? view<VenearAccountView>(VENEAR_ACCOUNT, "get_account_info", { account_id: endowment })
        : null,
      team && pool ? view<string>(pool, "get_account_staked_balance", { account_id: team }) : null,
      team && voteProposalId != null
        ? view<number>(VOTING_ACCOUNT, "get_vote", {
            account_id: team,
            proposal_id: voteProposalId,
          })
        : null,
    ]);
  const [teamLockupState, endowmentLockupState] = await Promise.all([
    teamVenear?.internal.lockup_version != null ? readLockupState(teamLockup) : null,
    endowmentVenear?.internal.lockup_version != null ? readLockupState(endowmentLockup) : null,
  ]);
  return {
    teamLockup,
    endowmentLockup,
    teamVenear,
    endowmentVenear,
    teamLockupState,
    endowmentLockupState,
    teamStakedYocto: teamPoolStake == null ? null : yoctoOf(teamPoolStake),
    teamVoted: teamVote != null,
  };
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

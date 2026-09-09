/**
 * Chain layer for the node lifecycle prototype.
 *
 * Every treasury action is described as a `DaoPlan` before it is signed. That
 * split matters because Trezu turns a DAO-signed call into a sputnik-dao
 * proposal: the same plan is used to stage the proposal, to match it against
 * the DAO's pending proposals, and to show the exact call in the UI.
 */

import { Amount, type FinalExecutionOutcome, fromNearConnect, Near } from "near-kit";
import { getDaoConnector } from "@/lib/dao-connect";

export const VENEAR_ACCOUNT = "venear.dao";
export const VOTING_ACCOUNT = "vote.dao";
export const WHITELIST_ACCOUNT = "lockup-whitelist.near";

export const REGISTER_DEPOSIT = "100000000000000000000000";
export const LOCKUP_DEPLOY_DEPOSIT = "2000000000000000000000000";
export const DELEGATE_DEPOSIT = "100000000000000000000000";
export const VOTE_DEPOSIT = "5000000000000000000000000";
export const ONE_YOCTO = "1";

export const ACTIVE_VOTE_STATUSES = ["Voting", "Sandbox"];
export const VOTE_OPTIONS = ["For", "Against", "Abstain"] as const;
export type VoteOption = (typeof VOTE_OPTIONS)[number];

let _near: Near | null = null;

export function getNear(): Near {
  if (!_near) _near = new Near({ network: "mainnet" });
  return _near;
}

/* ---------------------------------------------------------------- formatting */

export function formatNear(yocto: string | undefined | null): string {
  if (!yocto) return "0 NEAR";
  try {
    const units = Number(BigInt(yocto) / 10n ** 20n) / 10000;
    if (!Number.isFinite(units)) return yocto;
    return `${units.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })} NEAR`;
  } catch {
    return yocto;
  }
}

export function isPositive(yocto: string | undefined | null): boolean {
  if (!yocto) return false;
  try {
    return BigInt(yocto) > 0n;
  } catch {
    return false;
  }
}

function balanceOf(value: string | undefined | null): bigint {
  try {
    return value ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

export function yoctoArg(value: unknown): bigint {
  try {
    return value == null ? 0n : BigInt(String(value));
  } catch {
    return 0n;
  }
}

/**
 * Re-run math: steps must top up what is missing instead of re-sending the
 * full configured amount, so retrying a half-done station never double-funds.
 */
export function remainingToFund(
  fundingYocto: string,
  state: LockupState | null | undefined,
): bigint {
  const want = BigInt(fundingYocto);
  if (!state) return want;
  const have = balanceOf(state.liquid) + balanceOf(state.locked);
  return want > have ? want - have : 0n;
}

export function remainingToLock(lockYocto: string, state: LockupState | null | undefined): bigint {
  const want = BigInt(lockYocto);
  if (!state) return want;
  const locked = balanceOf(state.locked);
  return want > locked ? want - locked : 0n;
}

export function remainingToStake(
  stakeYocto: string,
  state: LockupState | null | undefined,
): bigint {
  const want = BigInt(stakeYocto);
  if (!state) return want;
  const staked = balanceOf(state.knownDeposited);
  return want > staked ? want - staked : 0n;
}

export function parseNearAmount(value: string): bigint | null {
  const parsed = Number(value);
  if (!value || Number.isNaN(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 1e24));
}

export function txHash(result: unknown): string | undefined {
  const hash = (result as { transaction?: { hash?: string } } | null)?.transaction?.hash;
  return hash ?? undefined;
}

export function nearblocksAccount(accountId: string): string {
  return `https://nearblocks.io/address/${accountId}`;
}

/** Sputnik treasuries read best on trezu.app; everything else on nearblocks. */
export function accountExplorerUrl(accountId: string): string {
  return accountId.endsWith(".sputnik-dao.near")
    ? `https://trezu.app/${accountId}`
    : nearblocksAccount(accountId);
}

export function poolValidatorUrl(poolAccountId: string): string {
  return `https://nodestats.nearcatalog.xyz/validators/${poolAccountId}`;
}

/** Renders a staking-pool fee fraction ("5/100") as a percent ("5%"). */
export function poolFeePercent(fee: string | undefined | null): string | null {
  if (!fee) return null;
  const [numerator, denominator] = fee.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return `${Math.round((numerator / denominator) * 10000) / 100}%`;
}

export async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 60_000,
  intervalMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return check();
}

/* -------------------------------------------------------------- view models */

export interface PoolAccountView {
  account_id: string;
  unstaked_balance: string;
  staked_balance: string;
  can_withdraw: boolean;
}

export interface PoolMeta {
  owner: string | null;
  paused: boolean;
  fee: string;
  totalStaked: string;
}

export interface VenearBalanceView {
  near_balance: string;
  extra_venear_balance: string;
}

export interface VenearAccountView {
  account: {
    account_id: string;
    balance: VenearBalanceView;
    delegated_balance: VenearBalanceView;
    delegations: { account_id: string; bps: number }[];
  };
  internal: {
    lockup_version: number | null;
    deposit: string;
    lockup_update_nonce: number;
  };
}

export interface LockupState {
  owner: string | null;
  liquid: string;
  locked: string;
  stakingPool: string | null;
  knownDeposited: string;
}

export interface GovProposalView {
  id: number;
  title: string | null;
  description: string | null;
  status: string;
  flow: string;
}

export function sumVenear(balance: VenearBalanceView | undefined): string | null {
  if (!balance) return null;
  return (BigInt(balance.near_balance) + BigInt(balance.extra_venear_balance)).toString();
}

export async function fetchPoolMeta(pool: string): Promise<PoolMeta | null> {
  try {
    const [owner, paused, fee, totalStaked] = await Promise.all([
      getNear().view<string>(pool, "get_owner_id", {}),
      getNear().view<boolean>(pool, "is_staking_paused", {}),
      getNear().view<{ numerator: string; denominator: string }>(
        pool,
        "get_reward_fee_fraction",
        {},
      ),
      getNear().view<string>(pool, "get_total_staked_balance", {}),
    ]);
    return {
      owner: owner ?? null,
      paused: !!paused,
      fee: fee ? `${fee.numerator}/${fee.denominator}` : "—",
      totalStaked: totalStaked ?? "0",
    };
  } catch {
    return null;
  }
}

export async function fetchLockupState(lockup: string): Promise<LockupState | null> {
  if (!lockup) return null;
  try {
    const [owner, liquid, locked, stakingPool, knownDeposited] = await Promise.all([
      getNear().view<string>(lockup, "get_owner_account_id", {}),
      getNear().view<string>(lockup, "get_venear_liquid_balance", {}),
      getNear().view<string>(lockup, "get_venear_locked_balance", {}),
      getNear().view<string | null>(lockup, "get_staking_pool_account_id", {}),
      getNear().view<string>(lockup, "get_known_deposited_balance", {}),
    ]);
    return {
      owner: owner ?? null,
      liquid: liquid ?? "0",
      locked: locked ?? "0",
      stakingPool: stakingPool ?? null,
      knownDeposited: knownDeposited ?? "0",
    };
  } catch {
    return null;
  }
}

export function fetchVenearAccount(accountId: string) {
  return getNear().view<VenearAccountView | null>(VENEAR_ACCOUNT, "get_account_info", {
    account_id: accountId,
  });
}

export function fetchLockupAccountId(accountId: string) {
  return getNear().view<string>(VENEAR_ACCOUNT, "get_lockup_account_id", {
    account_id: accountId,
  });
}

export async function fetchActiveGovProposals(): Promise<GovProposalView[]> {
  const all = await getNear().view<GovProposalView[]>(VOTING_ACCOUNT, "get_proposals", {
    from_index: 0,
    limit: 100,
  });
  return (all ?? []).filter((proposal) => ACTIVE_VOTE_STATUSES.includes(proposal.status));
}

/* ------------------------------------------------------- sputnik dao proposals */

export interface SputnikFunctionCallAction {
  method_name: string;
  args: string;
  deposit: string;
  gas: string;
}

export interface SputnikProposal {
  id: number;
  proposer: string;
  description: string;
  kind:
    | { FunctionCall: { receiver_id: string; actions: SputnikFunctionCallAction[] } }
    | { Transfer: { token_id: string; receiver_id: string; amount: string } }
    | Record<string, unknown>;
  status: string;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
}

export interface SputnikRole {
  name: string;
  kind: { Group?: string[] } | "Everyone" | string;
  permissions?: string[];
  vote_policy?: Record<string, { threshold?: string | [number, number] }>;
}

export interface SputnikPolicy {
  roles: SputnikRole[];
  default_vote_policy?: { threshold?: string | [number, number] };
}

/** Reads the most recent proposals, newest first. */
export async function fetchDaoProposals(
  daoAccountId: string,
  window = 25,
): Promise<SputnikProposal[]> {
  if (!daoAccountId) return [];
  try {
    const last = await getNear().view<number>(daoAccountId, "get_last_proposal_id", {});
    const total = Number(last ?? 0);
    if (!total) return [];
    const fromIndex = Math.max(0, total - window);
    const proposals = await getNear().view<SputnikProposal[]>(daoAccountId, "get_proposals", {
      from_index: fromIndex,
      limit: window,
    });
    return [...(proposals ?? [])].sort((a, b) => b.id - a.id);
  } catch {
    return [];
  }
}

export async function fetchSputnikPolicy(daoAccountId: string): Promise<SputnikPolicy | null> {
  if (!daoAccountId) return null;
  try {
    return (await getNear().view<SputnikPolicy>(daoAccountId, "get_policy", {})) ?? null;
  } catch {
    return null;
  }
}

export function roleMembers(role: SputnikRole): string[] {
  if (typeof role.kind === "object" && role.kind && Array.isArray(role.kind.Group)) {
    return role.kind.Group;
  }
  return [];
}

function permits(permissions: string[] | undefined, action: string): boolean {
  if (!permissions) return false;
  return permissions.some(
    (permission) =>
      permission === "*:*" ||
      permission === `*:${action}` ||
      permission === "call:*" ||
      permission === `call:${action}`,
  );
}

/** Roles that can approve a FunctionCall/Transfer proposal. */
export function approverRoles(policy: SputnikPolicy | null | undefined): SputnikRole[] {
  if (!policy?.roles) return [];
  return policy.roles.filter((role) => permits(role.permissions, "VoteApprove"));
}

export function canAccountApprove(
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
): boolean {
  if (!accountId) return false;
  return approverRoles(policy).some((role) => {
    if (role.kind === "Everyone") return true;
    return roleMembers(role).includes(accountId);
  });
}

export interface ApprovalThreshold {
  role: string | null;
  /** Votes required, or null when the policy uses an unresolvable ratio. */
  required: number | null;
  approved: number;
}

/**
 * Approval progress for a pending proposal. Sputnik thresholds are either an
 * absolute count (`"1"`) or a ratio (`[1, 2]`); ratios resolve against the
 * approving role's member count.
 */
export function approvalThreshold(
  policy: SputnikPolicy | null | undefined,
  proposal: SputnikProposal | null | undefined,
): ApprovalThreshold {
  const role = approverRoles(policy)[0] ?? null;
  const approved = role ? Number(proposal?.vote_counts?.[role.name]?.[0] ?? 0) : 0;
  if (!role) return { role: null, required: null, approved };

  const raw = role.vote_policy?.call?.threshold ?? policy?.default_vote_policy?.threshold;
  if (typeof raw === "string") {
    return { role: role.name, required: Number(raw), approved };
  }
  if (Array.isArray(raw) && raw.length === 2) {
    const members = roleMembers(role).length;
    if (!members) return { role: role.name, required: null, approved };
    const [numerator, denominator] = raw;
    return {
      role: role.name,
      required: Math.floor((members * numerator) / denominator) + 1,
      approved,
    };
  }
  return { role: role.name, required: null, approved };
}

/* ----------------------------------------------------------------- dao plans */

export type DaoPlan =
  | {
      kind: "call";
      receiverId: string;
      methodName: string;
      args: Record<string, unknown>;
      gas: string;
      attachedDeposit?: string;
    }
  | { kind: "transfer"; receiverId: string; amountYocto: string };

export function describePlan(plan: DaoPlan): string {
  if (plan.kind === "transfer") {
    return `transfer ${formatNear(plan.amountYocto)} to ${plan.receiverId}`;
  }
  return `${plan.receiverId}.${plan.methodName}()`;
}

/** `receiverId` on a plan; `ANY_RECEIVER` matches on method name alone. */
export const ANY_RECEIVER = "*";

/** True when a pending DAO proposal carries out the given plan. */
export function proposalMatchesPlan(proposal: SputnikProposal, plan: DaoPlan): boolean {
  const kind = proposal.kind as {
    FunctionCall?: { receiver_id: string; actions: SputnikFunctionCallAction[] };
    Transfer?: { receiver_id: string };
  };
  if (plan.kind === "transfer") {
    return kind.Transfer?.receiver_id === plan.receiverId;
  }
  if (!kind.FunctionCall) return false;
  if (plan.receiverId !== ANY_RECEIVER && kind.FunctionCall.receiver_id !== plan.receiverId) {
    return false;
  }
  return kind.FunctionCall.actions.some((action) => action.method_name === plan.methodName);
}

export function isPendingProposal(proposal: SputnikProposal): boolean {
  return proposal.status === "InProgress";
}

export function findPendingProposalForPlan(
  proposals: SputnikProposal[],
  plan: DaoPlan,
): SputnikProposal | null {
  return (
    proposals.find(
      (proposal) => isPendingProposal(proposal) && proposalMatchesPlan(proposal, plan),
    ) ?? null
  );
}

/* -------------------------------------------------------------------- signing */

function daoNear(): Near {
  return new Near({ network: "mainnet", wallet: fromNearConnect(getDaoConnector()) });
}

/**
 * Signs a plan as the connected DAO. With a multi-member threshold this creates
 * a pending sputnik proposal rather than executing immediately.
 */
export async function signPlanAsDao(
  daoAccountId: string,
  plan: DaoPlan,
): Promise<FinalExecutionOutcome> {
  if (plan.kind === "transfer") {
    return daoNear()
      .transaction(daoAccountId)
      .transfer(plan.receiverId, Amount.yocto(BigInt(plan.amountYocto)))
      .send({ waitUntil: "EXECUTED" });
  }
  return daoNear()
    .transaction(daoAccountId)
    .functionCall(plan.receiverId, plan.methodName, plan.args as Record<string, never>, {
      gas: plan.gas as `${number} Tgas`,
      attachedDeposit: plan.attachedDeposit
        ? Amount.yocto(BigInt(plan.attachedDeposit))
        : Amount.ZERO,
    })
    .send({ waitUntil: "EXECUTED" });
}

export interface SessionSigner {
  accountId: string;
  send(plan: Extract<DaoPlan, { kind: "call" }>): Promise<FinalExecutionOutcome>;
}

/** Votes on a pending DAO proposal as a policy member, signed by the session wallet. */
export function approveProposalPlan(
  daoAccountId: string,
  proposalId: number,
): Extract<DaoPlan, { kind: "call" }> {
  return {
    kind: "call",
    receiverId: daoAccountId,
    methodName: "act_proposal",
    args: { id: proposalId, action: "VoteApprove" },
    gas: "200 Tgas",
  };
}

export function fetchGovVoteRecord(accountId: string, proposalId: number) {
  return getNear().view<number | null>(VOTING_ACCOUNT, "get_vote", {
    account_id: accountId,
    proposal_id: proposalId,
  });
}

export function fetchGovProof(accountId: string) {
  return getNear().view<[unknown, unknown]>(VENEAR_ACCOUNT, "get_proof", {
    account_id: accountId,
  });
}

/**
 * Sputnik-dao proposal reading and matching, shared by the node lifecycle
 * prototype and the org node-config editor. Treasury actions are described
 * as a `DaoPlan` before they are signed, so the same plan drives staging,
 * proposal matching and the call preview in the UI.
 */

import { Amount, type FinalExecutionOutcome, Near } from "near-kit";

let _near: Near | null = null;

export function getNear(): Near {
  if (!_near) _near = new Near({ network: "mainnet" });
  return _near;
}

export function trezuDaoUrl(daoAccountId: string): string {
  return `https://trezu.app/${daoAccountId}`;
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
  kind: { Group?: string[]; Member?: string } | string;
  permissions?: string[];
  vote_policy?: Record<string, { threshold?: string | [number, number] }>;
}

export interface SputnikPolicy {
  roles: SputnikRole[];
  default_vote_policy?: { threshold?: string | [number, number] };
  proposal_period?: string;
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

export async function readDaoProposalsSince(
  daoAccountId: string,
  sinceNs: bigint,
  pageSize = 100,
  maxIds = 2000,
): Promise<SputnikProposal[]> {
  if (!daoAccountId) return [];
  const last = Number(
    (await getNear().view<number>(daoAccountId, "get_last_proposal_id", {})) ?? 0,
  );
  const floor = Math.max(0, last - maxIds);
  const proposals: SputnikProposal[] = [];
  for (let end = last; end > floor; ) {
    const fromIndex = Math.max(floor, end - pageSize);
    const batch =
      (await getNear().view<SputnikProposal[]>(daoAccountId, "get_proposals", {
        from_index: fromIndex,
        limit: end - fromIndex,
      })) ?? [];
    proposals.push(...batch);
    if (batch.some((proposal) => BigInt(proposal.submission_time) < sinceNs)) {
      return proposals.sort((a, b) => b.id - a.id);
    }
    end = fromIndex;
  }
  if (floor > 0) {
    throw new Error(
      `Proposal ID range beyond the newest ${maxIds} IDs in ${daoAccountId} not read`,
    );
  }
  return proposals.sort((a, b) => b.id - a.id);
}

export async function readChainTimeNs(): Promise<bigint> {
  const block = await getNear().rpc.getBlock({ finality: "final" });
  return BigInt(block.header.timestamp_nanosec);
}

export async function readDelegationBalance(
  daoAccountId: string,
  accountId: string,
): Promise<bigint> {
  const balance = await getNear().view<string>(daoAccountId, "delegation_balance_of", {
    account_id: accountId,
  });
  if (typeof balance !== "string" || !/^\d+$/.test(balance)) {
    throw new Error(`Unreadable delegation balance for ${accountId} in ${daoAccountId}`);
  }
  return BigInt(balance);
}

export async function readSputnikPolicy(daoAccountId: string): Promise<SputnikPolicy | null> {
  if (!daoAccountId) return null;
  return (await getNear().view<SputnikPolicy>(daoAccountId, "get_policy", {})) ?? null;
}

export async function fetchSputnikPolicy(daoAccountId: string): Promise<SputnikPolicy | null> {
  return readSputnikPolicy(daoAccountId).catch(() => null);
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

function memberThreshold(role: SputnikRole): bigint | null {
  if (typeof role.kind !== "object" || !role.kind || typeof role.kind.Member !== "string") {
    return null;
  }
  return /^\d+$/.test(role.kind.Member) ? BigInt(role.kind.Member) : null;
}

function accountInRoles(
  roles: SputnikRole[],
  accountId: string,
  delegationBalance: bigint | undefined,
): boolean {
  return roles.some((role) => {
    if (role.kind === "Everyone") return true;
    const threshold = memberThreshold(role);
    if (threshold !== null) {
      return delegationBalance !== undefined ? delegationBalance >= threshold : threshold === 0n;
    }
    return roleMembers(role).includes(accountId);
  });
}

/** Roles that can approve a FunctionCall/Transfer proposal. */
export function approverRoles(policy: SputnikPolicy | null | undefined): SputnikRole[] {
  if (!policy?.roles) return [];
  return policy.roles.filter((role) => permits(role.permissions, "VoteApprove"));
}

/** Roles that can add a FunctionCall ("call") proposal. */
export function proposerRoles(policy: SputnikPolicy | null | undefined): SputnikRole[] {
  if (!policy?.roles) return [];
  return policy.roles.filter((role) => permits(role.permissions, "AddProposal"));
}

export function canAccountPropose(
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
  delegationBalance?: bigint,
): boolean {
  if (!accountId) return false;
  return accountInRoles(proposerRoles(policy), accountId, delegationBalance);
}

export function canAccountApprove(
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
  delegationBalance?: bigint,
): boolean {
  if (!accountId) return false;
  return accountInRoles(approverRoles(policy), accountId, delegationBalance);
}

export function needsDelegationBalance(
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
): boolean {
  if (!accountId || canAccountPropose(policy, accountId)) return false;
  return [...proposerRoles(policy), ...approverRoles(policy)].some(
    (role) => (memberThreshold(role) ?? 0n) > 0n,
  );
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

function gasToRaw(gas: string): string {
  const match = gas.match(/([\d.]+)\s*Tgas/);
  if (!match) return gas.replace(/\D/g, "") || "0";
  return BigInt(Math.round(Number(match[1]) * 1e12)).toString();
}

export function buildAddProposalArgs(plan: DaoPlan, description: string) {
  const kind =
    plan.kind === "transfer"
      ? { Transfer: { token_id: "", receiver_id: plan.receiverId, amount: plan.amountYocto } }
      : {
          FunctionCall: {
            receiver_id: plan.receiverId,
            actions: [
              {
                method_name: plan.methodName,
                args: btoa(JSON.stringify(plan.args)),
                deposit: plan.attachedDeposit ?? "0",
                gas: gasToRaw(plan.gas),
              },
            ],
          },
        };
  return { proposal: { description, kind } };
}

export async function fetchProposalBond(daoAccountId: string): Promise<string> {
  const policy = await getNear()
    .view<{ proposal_bond?: string }>(daoAccountId, "get_policy", {})
    .catch(() => null);
  return policy?.proposal_bond ?? "0";
}

export interface SessionWallet {
  ensureConnected(): Promise<boolean>;
  getAccountId(): string | null;
  getNearClient(): Near;
}

export async function proposeAsSession(
  wallet: SessionWallet,
  daoAccountId: string,
  plan: DaoPlan,
  description: string,
): Promise<FinalExecutionOutcome> {
  const connected = await wallet.ensureConnected();
  const accountId = wallet.getAccountId();
  if (!connected || !accountId) throw new Error("Connect your NEAR wallet first");
  const bond = await fetchProposalBond(daoAccountId);
  return wallet
    .getNearClient()
    .transaction(accountId)
    .functionCall(
      daoAccountId,
      "add_proposal",
      buildAddProposalArgs(plan, description) as unknown as Record<string, never>,
      {
        gas: "100 Tgas",
        attachedDeposit: bond ? Amount.yocto(BigInt(bond)) : Amount.ZERO,
      },
    )
    .send({ waitUntil: "EXECUTED" });
}

/** `receiverId` on a plan; `ANY_RECEIVER` matches on method name alone. */
export const ANY_RECEIVER = "*";

/**
 * The registry config write: any `__fastdata_kv` call publishes or updates a
 * runtime config (title, repository, custom UI bundle). Used to match a
 * pending DAO proposal back to a config change made in the node-config editor.
 */
export const CONFIG_WRITE_PLAN: DaoPlan = {
  kind: "call",
  receiverId: ANY_RECEIVER,
  methodName: "__fastdata_kv",
  args: {},
  gas: "300 Tgas",
};

/** True when a pending DAO proposal carries out the given plan. */
export function proposalMatchesPlan(proposal: SputnikProposal, plan: DaoPlan): boolean {
  if (plan.kind === "transfer") {
    const kind = proposal.kind as { Transfer?: { receiver_id: string } };
    return kind.Transfer?.receiver_id === plan.receiverId;
  }
  return proposalCallsMethod(proposal, plan.receiverId, [plan.methodName]);
}

export function proposalCallsMethod(
  proposal: SputnikProposal,
  receiverId: string,
  methodNames: readonly string[],
): boolean {
  const call = (
    proposal.kind as {
      FunctionCall?: { receiver_id: string; actions: SputnikFunctionCallAction[] };
    }
  ).FunctionCall;
  if (!call) return false;
  if (receiverId !== ANY_RECEIVER && call.receiver_id !== receiverId) return false;
  return call.actions.some((action) => methodNames.includes(action.method_name));
}

export function isPendingProposal(proposal: SputnikProposal): boolean {
  return proposal.status === "InProgress";
}

export function isOpenProposal(
  proposal: SputnikProposal,
  policy: Pick<SputnikPolicy, "proposal_period"> | null | undefined,
  chainNowNs: bigint,
): boolean {
  if (proposal.status !== "InProgress" && proposal.status !== "Failed") return false;
  if (!policy?.proposal_period) return true;
  return BigInt(proposal.submission_time) + BigInt(policy.proposal_period) >= chainNowNs;
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

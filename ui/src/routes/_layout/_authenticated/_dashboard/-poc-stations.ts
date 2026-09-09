/**
 * The node lifecycle as an ordered cycle of stations, grouped into three phases.
 *
 * Each station declares the one wallet that must sign it. That matters because
 * the Trezu DAO connection is a singleton (`ui/src/lib/dao-connect.ts`): only
 * one treasury is connected at a time, so a station whose signer is not
 * currently connected offers to switch rather than pretending to be runnable.
 *
 * Stations own one or more steps. Every on-chain step maps to exactly one
 * sputnik-dao proposal; while a proposal awaits votes the step shows as staged.
 */

import {
  ANY_RECEIVER,
  type DaoPlan,
  DELEGATE_DEPOSIT,
  findPendingProposalForPlan,
  LOCKUP_DEPLOY_DEPOSIT,
  ONE_YOCTO,
  REGISTER_DEPOSIT,
  type SputnikProposal,
  VENEAR_ACCOUNT,
} from "./-poc-chain";

export type SignerKind = "session" | "endowment" | "team";
export type PhaseId = "stand-up" | "fund" | "vote";
export type StationId =
  | "apply"
  | "approve"
  | "publish"
  | "endow"
  | "stake"
  | "register-team"
  | "delegate"
  | "vote";

export type StepStatus = "pending" | "staged" | "done" | "skipped";

export type StationStatus =
  | "blocked"
  | "ready"
  | "staged"
  | "running"
  | "done"
  | "skipped"
  | "failed";

export interface PhaseDef {
  id: PhaseId;
  title: string;
  blurb: string;
}

export const PHASES: readonly PhaseDef[] = [
  {
    id: "stand-up",
    title: "Stand it up",
    blurb: "your wallet applies; approval creates the tenant and publishes its UI bundle",
  },
  {
    id: "fund",
    title: "Fund it",
    blurb: "the sponsor endowment locks NEAR and stakes the node's pool",
  },
  {
    id: "vote",
    title: "Make it vote",
    blurb: "the team registers in veNEAR, receives the sponsor's voting power, votes",
  },
];

export interface StepDef {
  id: string;
  label: string;
  /** Absent for off-chain API steps, which never become DAO proposals. */
  plan?: DaoPlan;
}

export interface StationDef {
  id: StationId;
  index: number;
  phase: PhaseId;
  title: string;
  signer: SignerKind;
  purpose: string;
  steps: StepDef[];
}

export interface StationInputs {
  slug: string;
  pool: string;
  endowmentAccount: string;
  teamAccount: string;
  /** Deterministic even before deployment, via `venear.dao.get_lockup_account_id`. */
  endowmentLockup: string;
  lockYocto: bigint | null;
  stakeYocto: bigint | null;
  delegateBps: number | null;
  govProposalId: number | null;
}

const OFFCHAIN = (id: string, label: string): StepDef => ({ id, label });

/**
 * Builds the ordered station list for the current inputs. Plans are pure data,
 * so the same definition drives staging, proposal matching and the call
 * preview shown in the UI.
 */
export function buildStations(inputs: StationInputs): StationDef[] {
  const {
    pool,
    endowmentAccount,
    teamAccount,
    endowmentLockup,
    lockYocto,
    stakeYocto,
    delegateBps,
    govProposalId,
  } = inputs;

  const fundingYocto = (lockYocto ?? 0n) + (stakeYocto ?? 0n);

  const defs: StationDef[] = [
    {
      id: "apply",
      index: 1,
      phase: "stand-up",
      title: "Apply for the node",
      signer: "session",
      purpose: "Your session wallet records the application against your organization.",
      steps: [OFFCHAIN("propose", "submit the application")],
    },
    {
      id: "approve",
      index: 2,
      phase: "stand-up",
      title: "Approve the application",
      signer: "session",
      purpose:
        "An admin session approves the application and creates the tenant, node and domain binding. Off-chain work — it needs a signed-in admin, not a treasury.",
      steps: [OFFCHAIN("approve", "approve the application")],
    },
    {
      id: "publish",
      index: 3,
      phase: "stand-up",
      title: "Publish and go live",
      signer: "team",
      purpose:
        "The team publishes the tenant's UI bundle to the FastKV registry, so the node serves its own UI. Once the config is live, an admin marks the application applied.",
      steps: [
        {
          id: "publish",
          label: "publish the tenant config",
          plan: {
            kind: "call",
            receiverId: ANY_RECEIVER,
            methodName: "__fastdata_kv",
            args: {},
            gas: "300 Tgas",
          },
        },
        OFFCHAIN("mark-applied", "mark the proposal applied"),
      ],
    },
    {
      id: "endow",
      index: 3,
      phase: "fund",
      title: "Lock the sponsor's NEAR",
      signer: "endowment",
      purpose:
        "The endowment registers in veNEAR, deploys its lockup, funds it and locks the NEAR. Locked NEAR is what mints voting power.",
      steps: [
        {
          id: "register",
          label: "register in veNEAR (0.1 NEAR)",
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "storage_deposit",
            args: {},
            gas: "30 Tgas",
            attachedDeposit: REGISTER_DEPOSIT,
          },
        },
        {
          id: "deploy-lockup",
          label: "deploy the lockup (2 NEAR)",
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "deploy_lockup",
            args: {},
            gas: "100 Tgas",
            attachedDeposit: LOCKUP_DEPLOY_DEPOSIT,
          },
        },
        {
          id: "fund-lockup",
          label: "fund the lockup",
          plan: {
            kind: "transfer",
            receiverId: endowmentLockup,
            amountYocto: fundingYocto.toString(),
          },
        },
        {
          id: "lock",
          label: "lock NEAR",
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "lock_near",
            args: lockYocto ? { amount: lockYocto.toString() } : {},
            gas: "50 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
      ],
    },
    {
      id: "stake",
      index: 4,
      phase: "fund",
      title: "Stake the node's pool",
      signer: "endowment",
      purpose:
        "Points the lockup at the node's pool and stakes into it. This stake earns the rewards.",
      steps: [
        {
          id: "select-pool",
          label: "select the pool on the lockup",
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "select_staking_pool",
            args: { staking_pool_account_id: pool },
            gas: "75 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
        {
          id: "stake",
          label: "stake from the lockup",
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "deposit_and_stake",
            args: stakeYocto ? { amount: stakeYocto.toString() } : {},
            gas: "125 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
      ],
    },
    {
      id: "register-team",
      index: 5,
      phase: "vote",
      title: "Register the team in veNEAR",
      signer: "team",
      purpose:
        "A wallet can only receive delegated voting power once registered. Skipped when team and endowment are one account.",
      steps: [
        {
          id: "register-team",
          label: "register in veNEAR (0.1 NEAR)",
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "storage_deposit",
            args: {},
            gas: "30 Tgas",
            attachedDeposit: REGISTER_DEPOSIT,
          },
        },
      ],
    },
    {
      id: "delegate",
      index: 6,
      phase: "vote",
      title: "Hand voting power to the team",
      signer: "endowment",
      purpose:
        "The endowment delegates its veNEAR voting power to the team wallet, replacing its whole delegation set. Skipped when both are one account.",
      steps: [
        {
          id: "set-delegations",
          label: "set delegations",
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "set_delegations",
            args:
              delegateBps && teamAccount
                ? { entries: [{ account_id: teamAccount, bps: delegateBps }] }
                : {},
            gas: "100 Tgas",
            attachedDeposit: DELEGATE_DEPOSIT,
          },
        },
      ],
    },
    {
      id: "vote",
      index: 7,
      phase: "vote",
      title: "Vote in House of Stake",
      signer: "team",
      purpose:
        "Casts a vote with the delegated power. Carries a fresh merkle proof of the account's veNEAR, so it cannot be staged early.",
      steps: [
        {
          id: "vote",
          label: govProposalId == null ? "vote on a proposal" : `vote on proposal ${govProposalId}`,
        },
      ],
    },
  ];

  return defs.map((station) => ({
    ...station,
    signer: resolveSigner(station.signer, endowmentAccount),
  }));
}

/** Endowment stations fall back to the team wallet when no endowment is set. */
function resolveSigner(signer: SignerKind, endowmentAccount: string): SignerKind {
  if (signer === "endowment" && !endowmentAccount) return "team";
  return signer;
}

export function signerAccount(
  signer: SignerKind,
  accounts: { session: string | null; endowment: string; team: string },
): string | null {
  if (signer === "session") return accounts.session;
  if (signer === "endowment") return accounts.endowment || null;
  return accounts.team || null;
}

/* ------------------------------------------------------------ status derivation */

export interface ChainFacts {
  tenantDeployed: boolean;
  applicationProposed: boolean;
  /** Review approved (approve step), distinct from the apply lifecycle. */
  applicationApproved: boolean;
  /** The tenant's config is live in the FastKV registry (publish step). */
  configPublished: boolean;
  applicationApplied: boolean;
  endowmentRegistered: boolean;
  lockupDeployed: boolean;
  lockupFunded: boolean;
  nearLocked: boolean;
  poolSelected: boolean;
  stakedFromLockup: boolean;
  teamRegistered: boolean;
  delegated: boolean;
  voteCast: boolean;
  /** Endowment and team wallet are the same account. */
  treasuriesShared: boolean;
}

const STEP_FACT: Record<string, keyof ChainFacts> = {
  propose: "applicationProposed",
  approve: "applicationApproved",
  publish: "configPublished",
  "mark-applied": "applicationApplied",
  register: "endowmentRegistered",
  "deploy-lockup": "lockupDeployed",
  "fund-lockup": "lockupFunded",
  lock: "nearLocked",
  "select-pool": "poolSelected",
  stake: "stakedFromLockup",
  "register-team": "teamRegistered",
  "set-delegations": "delegated",
  vote: "voteCast",
};

export interface StepState extends StepDef {
  status: StepStatus;
  pendingProposal: SputnikProposal | null;
}

export interface StationState {
  def: StationDef;
  status: StationStatus;
  steps: StepState[];
  /** Populated when the station is blocked on something the user must fix. */
  blockedReason: string | null;
  /**
   * Why the station is blocked. `upstream` clears itself as earlier stations
   * land, so a chained run may walk through it; `input` needs the user to fix
   * something first, so a run must stop there.
   */
  blockedBy: "upstream" | "input" | null;
  /** Account that must sign, resolved from the current inputs. */
  signerAccountId: string | null;
  /** Whether the required signer is the currently connected treasury. */
  signerConnected: boolean;
  /** Whether the run button should be enabled right now. */
  canRun: boolean;
  /** Shown on the disabled run button explaining why it is disabled. */
  runBlockReason: string | null;
}

export interface DeriveOptions {
  stations: StationDef[];
  facts: ChainFacts;
  /** Pending sputnik proposals keyed by the DAO that owns them. */
  proposalsBySigner: Partial<Record<SignerKind, SputnikProposal[]>>;
  accounts: { session: string | null; endowment: string; team: string };
  connectedDao: string | null;
  /** Per-station reasons the station cannot run yet, e.g. missing inputs. */
  blockers?: Partial<Record<StationId, string>>;
  runningStation?: StationId | null;
  failedStations?: Partial<Record<StationId, string>>;
}

/** True when a station is a no-op because both treasuries are one account. */
export function isSharedTreasurySkip(stationId: StationId, facts: ChainFacts): boolean {
  if (!facts.treasuriesShared) return false;
  return stationId === "register-team" || stationId === "delegate";
}

export function deriveStations(options: DeriveOptions): StationState[] {
  const { stations, facts, proposalsBySigner, accounts, connectedDao } = options;
  const blockers = options.blockers ?? {};
  const failures = options.failedStations ?? {};

  let upstreamIncomplete = false;

  return stations.map((def) => {
    const signerAccountId = signerAccount(def.signer, accounts);
    const signerConnected =
      def.signer === "session" ? true : !!signerAccountId && signerAccountId === connectedDao;
    const pending = proposalsBySigner[def.signer] ?? [];

    const steps: StepState[] = def.steps.map((step) => {
      const fact = STEP_FACT[step.id];
      const satisfied = fact ? facts[fact] === true : false;
      const pendingProposal = step.plan ? findPendingProposalForPlan(pending, step.plan) : null;
      const status: StepStatus = satisfied ? "done" : pendingProposal ? "staged" : "pending";
      return { ...step, status, pendingProposal };
    });

    const blockedByInput = blockers[def.id] ? "input" : null;
    const blockedByUpstream = upstreamIncomplete ? "upstream" : null;

    const status = ((): StationStatus => {
      if (isSharedTreasurySkip(def.id, facts)) return "skipped";
      if (failures[def.id]) return "failed";
      if (options.runningStation === def.id) return "running";
      if (steps.every((step) => step.status === "done")) return "done";
      if (steps.some((step) => step.status === "staged")) return "staged";
      if (blockedByInput || blockedByUpstream) return "blocked";
      return "ready";
    })();

    if (status !== "done" && status !== "skipped") {
      upstreamIncomplete = true;
    }

    const blockedBy = status === "blocked" ? (blockedByInput ?? blockedByUpstream) : null;
    const blockedReason =
      failures[def.id] ??
      blockers[def.id] ??
      (blockedBy === "upstream" ? "waiting on an earlier station" : null);

    const { canRun, runBlockReason } = deriveRunGate({
      status,
      blockedBy,
      blockerReason: blockers[def.id] ?? null,
      signerConnected,
      hasPendingSteps: steps.some((step) => step.status === "pending"),
    });

    return {
      def,
      status,
      steps,
      blockedReason,
      blockedBy,
      signerAccountId,
      signerConnected,
      canRun,
      runBlockReason,
    };
  });
}

/**
 * Decides whether a station's run button is enabled, and why it is disabled
 * when not. Stations must be disabled with a reason rather than clickable and
 * left to fail.
 */
export function deriveRunGate(input: {
  status: StationStatus;
  blockedBy: "upstream" | "input" | null;
  blockerReason: string | null;
  signerConnected: boolean;
  hasPendingSteps: boolean;
}): { canRun: boolean; runBlockReason: string | null } {
  if (input.status === "done" || input.status === "skipped" || input.status === "running") {
    return { canRun: false, runBlockReason: null };
  }
  if (input.blockedBy === "input") {
    return { canRun: false, runBlockReason: input.blockerReason ?? "input needed" };
  }
  if (input.blockedBy === "upstream") {
    return { canRun: false, runBlockReason: "waiting on an earlier station" };
  }
  if (!input.signerConnected) {
    return { canRun: false, runBlockReason: "connect the treasury to continue" };
  }
  if (!input.hasPendingSteps) {
    return { canRun: false, runBlockReason: "awaiting votes" };
  }
  return { canRun: true, runBlockReason: null };
}

/* ----------------------------------------------------------- one-click helpers */

/**
 * The longest run of consecutive stations that the currently connected wallet
 * can sign right now. Drives "run what I can sign": it never crosses a signer
 * boundary, because switching treasuries needs a new Trezu connection. Stations
 * blocked only by upstream ordering are included, since running the earlier
 * station is what unblocks them.
 */
export function runnableRun(stations: StationState[]): StationState[] {
  const run: StationState[] = [];
  for (const station of stations) {
    if (station.status === "done" || station.status === "skipped") continue;
    if (!station.steps.some((step) => step.status === "pending")) continue;
    if (station.status === "failed" || station.blockedBy === "input") break;
    if (!station.signerConnected) break;
    if (run.length > 0 && run[0].def.signer !== station.def.signer) break;
    run.push(station);
  }
  return run;
}

/** The first station that still needs work, whether or not it can run now. */
export function nextStation(stations: StationState[]): StationState | null {
  return (
    stations.find((station) => station.status !== "done" && station.status !== "skipped") ?? null
  );
}

export function pendingProposalCount(stations: StationState[]): number {
  const ids = new Set<string>();
  for (const station of stations) {
    for (const step of station.steps) {
      if (step.pendingProposal) ids.add(`${station.def.signer}:${step.pendingProposal.id}`);
    }
  }
  return ids.size;
}

export const SIGNER_LABEL: Record<SignerKind, string> = {
  session: "session wallet",
  endowment: "endowment",
  team: "team",
};

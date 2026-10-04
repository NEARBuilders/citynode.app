import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

/**
 * The node lifecycle as an ordered cycle of stations, grouped into phases.
 *
 * Each station declares the one wallet that must sign it. That matters because
 * the Trezu DAO connection is a singleton (`ui/src/lib/dao-connect.ts`): only
 * one treasury is connected at a time, so a station whose signer is not
 * currently connected offers to switch rather than pretending to be runnable.
 *
 * Ordering is declarative: a station lists the chain facts it requires, and
 * nothing else. There is no implicit upstream walk — the bootstrap stations
 * run in any order, and the endowment phase is optional and never gates the
 * team's vote. Stations own one or more steps; every on-chain step maps to
 * exactly one sputnik-dao proposal, and carries the deposit it consumes from
 * its signer's treasury so the funding requirement can be derived.
 */

import {
  ANY_RECEIVER,
  type DaoPlan,
  DELEGATE_DEPOSIT,
  findPendingProposalForPlan,
  LOCKUP_DEPLOY_DEPOSIT,
  MIN_TEAM_STAKE_YOCTO,
  ONE_YOCTO,
  REGISTER_DEPOSIT,
  type SputnikProposal,
  VENEAR_ACCOUNT,
  VOTE_STORAGE_FEE_FALLBACK,
} from "./-poc-chain";

export type SignerKind = "session" | "team" | "endowment";
export type LensId = "you" | "team" | "endowment";
export type PhaseId = "stand-up" | "bootstrap" | "sponsor" | "vote" | "refresh";
/** The sponsor hands its whole voting power to the team. */
export const DELEGATE_BPS = 10_000;
export type StationId =
  | "apply"
  | "approve"
  | "fund"
  | "publish"
  | "stake"
  | "setup-hos"
  | "sponsor-lock"
  | "sponsor-stake"
  | "sponsor-delegate"
  | "vote"
  | "unstake"
  | "sponsor-unwind";

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

export function createPhases(t: AppTranslator): readonly PhaseDef[] {
  return [
    {
      id: "stand-up",
      title: t("lifecycle.initialize"),
      blurb: t("lifecycle.phaseInitializeHint"),
    },
    {
      id: "bootstrap",
      title: t("lifecycle.bootstrap"),
      blurb: t("lifecycle.phaseBootstrapHint"),
    },
    {
      id: "sponsor",
      title: t("lifecycle.sponsorPhase"),
      blurb: t("lifecycle.phaseSponsorHint"),
    },
    {
      id: "vote",
      title: t("lifecycle.governance"),
      blurb: t("lifecycle.phaseVoteHint"),
    },
    {
      id: "refresh",
      title: t("lifecycle.refresh"),
      blurb: t("lifecycle.phaseRefreshHint"),
    },
  ];
}

export const PHASES: readonly PhaseDef[] = createPhases(translateEnglishAppMessage);

export interface StepDef {
  id: string;
  label: string;
  /** Absent for off-chain API steps, which never become DAO proposals. */
  plan?: DaoPlan;
  /** Attached deposit the step consumes from its signer's treasury. */
  costYocto?: string;
}

export interface StationDef {
  id: StationId;
  index: number;
  phase: PhaseId;
  title: string;
  signer: SignerKind;
  purpose: string;
  steps: StepDef[];
  /** Chain facts that must hold before the station can run, with the reason shown while missing. */
  requires?: Partial<Record<keyof ChainFacts, string>>;
}

export interface StationInputs {
  slug: string;
  pool: string;
  teamAccount: string;
  endowmentAccount: string;
  /** Deterministic even before deployment, via `venear.dao.get_lockup_account_id`. */
  teamLockup: string;
  endowmentLockup: string;
  /** The sponsor's transfer into its lockup — uncapped, set by the endowment. */
  sponsorYocto: bigint | null;
  /** How much of the sponsor's NEAR goes into the pool from the lockup. */
  sponsorStakeYocto: bigint | null;
  govProposalId: number | null;
}

const OFFCHAIN = (id: string, label: string): StepDef => ({ id, label });

/**
 * Builds the ordered station list for the current inputs. Plans are pure data,
 * so the same definition drives staging, proposal matching and the call
 * preview shown in the UI.
 */
export function buildStations(
  inputs: StationInputs,
  t: AppTranslator = translateEnglishAppMessage,
): StationDef[] {
  const {
    pool,
    teamAccount,
    teamLockup,
    endowmentLockup,
    sponsorYocto,
    sponsorStakeYocto,
    govProposalId,
  } = inputs;

  return [
    {
      id: "apply",
      index: 1,
      phase: "stand-up",
      title: t("lifecycle.apply"),
      signer: "session",
      purpose: t("lifecycle.purposeApply"),
      steps: [OFFCHAIN("propose", t("lifecycle.applyStep"))],
    },
    {
      id: "approve",
      index: 2,
      phase: "stand-up",
      title: t("lifecycle.approveAssign"),
      signer: "session",
      purpose: t("lifecycle.purposeApprove"),
      requires: { applicationProposed: t("lifecycle.applyFirst") },
      steps: [OFFCHAIN("approve", t("lifecycle.approveStep"))],
    },
    {
      id: "fund",
      index: 3,
      phase: "stand-up",
      title: t("lifecycle.fundTeam"),
      signer: "session",
      purpose: t("lifecycle.purposeFund"),
      requires: { tenantDeployed: t("lifecycle.approveFirst") },
      steps: [OFFCHAIN("fund-treasury", t("lifecycle.fundStep"))],
    },
    {
      id: "publish",
      index: 4,
      phase: "bootstrap",
      title: t("lifecycle.publishLive"),
      signer: "team",
      purpose: t("lifecycle.purposePublish"),
      requires: { tenantDeployed: t("lifecycle.approveFirst") },
      steps: [
        {
          id: "publish",
          label: t("lifecycle.publishConfig"),
          plan: {
            kind: "call",
            receiverId: ANY_RECEIVER,
            methodName: "__fastdata_kv",
            args: {},
            gas: "300 Tgas",
          },
        },
        OFFCHAIN("mark-applied", t("lifecycle.markStep")),
      ],
    },
    {
      id: "stake",
      index: 5,
      phase: "bootstrap",
      title: t("lifecycle.stakePool"),
      signer: "team",
      purpose: t("lifecycle.purposeStake"),
      requires: {
        poolAssigned: t("lifecycle.poolFirst"),
        treasuryFunded: t("lifecycle.fundStakeFirst"),
      },
      steps: [
        {
          id: "stake",
          label: t("lifecycle.stakeOne"),
          costYocto: MIN_TEAM_STAKE_YOCTO.toString(),
          plan: {
            kind: "call",
            receiverId: pool,
            methodName: "deposit_and_stake",
            args: {},
            gas: "200 Tgas",
            attachedDeposit: MIN_TEAM_STAKE_YOCTO.toString(),
          },
        },
      ],
    },
    {
      id: "setup-hos",
      index: 6,
      phase: "bootstrap",
      title: t("lifecycle.setupHos"),
      signer: "team",
      purpose: t("lifecycle.purposeHos"),
      requires: {
        treasuryFunded: t("lifecycle.fundHosFirst"),
      },
      steps: [
        {
          id: "register",
          label: t("lifecycle.registerStep"),
          costYocto: REGISTER_DEPOSIT,
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
          label: t("lifecycle.deployLockup"),
          costYocto: LOCKUP_DEPLOY_DEPOSIT,
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
          id: "lock",
          label: t("lifecycle.lockNear"),
          plan: {
            kind: "call",
            receiverId: teamLockup,
            methodName: "lock_near",
            args: {},
            gas: "100 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
      ],
    },
    {
      id: "sponsor-lock",
      index: 7,
      phase: "sponsor",
      title: t("lifecycle.lockSponsor"),
      signer: "endowment",
      purpose: t("lifecycle.purposeSponsorLock"),
      requires: { tenantDeployed: t("lifecycle.approveFirst") },
      steps: [
        {
          id: "register-endowment",
          label: t("lifecycle.registerStep"),
          costYocto: REGISTER_DEPOSIT,
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
          id: "deploy-lockup-endowment",
          label: t("lifecycle.deployLockup"),
          costYocto: LOCKUP_DEPLOY_DEPOSIT,
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
          label: t("lifecycle.transferLockup"),
          plan: sponsorYocto
            ? {
                kind: "transfer",
                receiverId: endowmentLockup,
                amountYocto: sponsorYocto.toString(),
              }
            : undefined,
        },
        {
          id: "lock-endowment",
          label: t("lifecycle.lockAll"),
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "lock_near",
            args: {},
            gas: "100 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
      ],
    },
    {
      id: "sponsor-stake",
      index: 8,
      phase: "sponsor",
      title: t("lifecycle.stakeLockup"),
      signer: "endowment",
      purpose: t("lifecycle.purposeSponsorStake"),
      requires: {
        poolAssigned: t("lifecycle.poolFirst"),
        endowmentFunded: t("lifecycle.sponsorFundFirst"),
      },
      steps: [
        {
          id: "unselect-old-pool",
          label: t("lifecycle.releaseSelected"),
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "unselect_staking_pool",
            args: {},
            gas: "25 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
        {
          id: "select-pool",
          label: t("lifecycle.selectLockupPool"),
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
          id: "stake-endowment",
          label: t("lifecycle.stakeFromLockup"),
          plan: sponsorStakeYocto
            ? {
                kind: "call",
                receiverId: endowmentLockup,
                methodName: "deposit_and_stake",
                args: { amount: sponsorStakeYocto.toString() },
                gas: "125 Tgas",
                attachedDeposit: ONE_YOCTO,
              }
            : undefined,
        },
      ],
    },
    {
      id: "sponsor-delegate",
      index: 9,
      phase: "sponsor",
      title: t("lifecycle.delegatePower"),
      signer: "endowment",
      purpose: t("lifecycle.purposeDelegate"),
      requires: {
        teamRegistered: t("lifecycle.teamRegisterFirst"),
      },
      steps: [
        {
          id: "set-delegations",
          label: t("lifecycle.setDelegations"),
          costYocto: DELEGATE_DEPOSIT,
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "set_delegations",
            args: teamAccount ? { entries: [{ account_id: teamAccount, bps: DELEGATE_BPS }] } : {},
            gas: "100 Tgas",
            attachedDeposit: DELEGATE_DEPOSIT,
          },
        },
      ],
    },
    {
      id: "vote",
      index: 10,
      phase: "vote",
      title: t("lifecycle.voteHos"),
      signer: "team",
      purpose: t("lifecycle.purposeVote"),
      requires: { nearLocked: t("lifecycle.lockFirst") },
      steps: [
        {
          id: "vote",
          label:
            govProposalId == null
              ? t("lifecycle.voteStep")
              : t("lifecycle.voteProposal", { proposal: govProposalId }),
        },
      ],
    },
    {
      id: "unstake",
      index: 11,
      phase: "refresh",
      title: t("lifecycle.unstakeTeam"),
      signer: "team",
      purpose: t("lifecycle.purposeUnstake"),
      requires: { teamStaked: t("lifecycle.noTeamStake") },
      steps: [
        {
          id: "unstake-all",
          label: t("lifecycle.unstakeAll"),
          plan: {
            kind: "call",
            receiverId: pool,
            methodName: "unstake_all",
            args: {},
            gas: "125 Tgas",
          },
        },
        {
          id: "withdraw",
          label: t("lifecycle.withdrawTeam"),
          plan: {
            kind: "call",
            receiverId: pool,
            methodName: "withdraw",
            args: {},
            gas: "125 Tgas",
          },
        },
      ],
    },
    {
      id: "sponsor-unwind",
      index: 12,
      phase: "refresh",
      title: t("lifecycle.unwindSponsor"),
      signer: "endowment",
      purpose: t("lifecycle.purposeUnwind"),
      requires: { endowmentStaked: t("lifecycle.noLockupStake") },
      steps: [
        {
          id: "unstake-endowment",
          label: t("lifecycle.unstakeAll"),
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "unstake_all",
            args: {},
            gas: "125 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
        {
          id: "withdraw-endowment",
          label: t("lifecycle.withdrawLockup"),
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "withdraw_all_from_staking_pool",
            args: {},
            gas: "175 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
        {
          id: "unselect-pool",
          label: t("lifecycle.releasePool"),
          plan: {
            kind: "call",
            receiverId: endowmentLockup,
            methodName: "unselect_staking_pool",
            args: {},
            gas: "25 Tgas",
            attachedDeposit: ONE_YOCTO,
          },
        },
        {
          id: "clear-delegations",
          label: t("lifecycle.removeDelegations"),
          costYocto: DELEGATE_DEPOSIT,
          plan: {
            kind: "call",
            receiverId: VENEAR_ACCOUNT,
            methodName: "set_delegations",
            args: { entries: [] },
            gas: "100 Tgas",
            attachedDeposit: DELEGATE_DEPOSIT,
          },
        },
      ],
    },
  ];
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
  applicationProposed: boolean;
  applicationApplied: boolean;
  tenantDeployed: boolean;
  poolAssigned: boolean;
  treasuryFunded: boolean;
  configPublished: boolean;
  teamStaked: boolean;
  teamRegistered: boolean;
  lockupDeployed: boolean;
  nearLocked: boolean;
  endowmentRegistered: boolean;
  endowmentLockupDeployed: boolean;
  endowmentFunded: boolean;
  endowmentLocked: boolean;
  endowmentPoolSelected: boolean;
  endowmentStaked: boolean;
  delegated: boolean;
  voteCast: boolean;
  teamUnstaked: boolean;
  teamWithdrawn: boolean;
  endowmentUnstaked: boolean;
  endowmentWithdrawn: boolean;
  endowmentPoolReleased: boolean;
  delegationsCleared: boolean;
  /** Endowment and team wallet are the same account. */
  treasuriesShared: boolean;
}

const STEP_FACT: Record<string, keyof ChainFacts> = {
  propose: "applicationProposed",
  approve: "tenantDeployed",
  "fund-treasury": "treasuryFunded",
  publish: "configPublished",
  "mark-applied": "applicationApplied",
  stake: "teamStaked",
  register: "teamRegistered",
  "deploy-lockup": "lockupDeployed",
  lock: "nearLocked",
  "register-endowment": "endowmentRegistered",
  "deploy-lockup-endowment": "endowmentLockupDeployed",
  "fund-lockup": "endowmentFunded",
  "lock-endowment": "endowmentLocked",
  "unselect-old-pool": "endowmentPoolSelected",
  "select-pool": "endowmentPoolSelected",
  "stake-endowment": "endowmentStaked",
  "set-delegations": "delegated",
  vote: "voteCast",
  "unstake-all": "teamUnstaked",
  withdraw: "teamWithdrawn",
  "unstake-endowment": "endowmentUnstaked",
  "withdraw-endowment": "endowmentWithdrawn",
  "unselect-pool": "endowmentPoolReleased",
  "clear-delegations": "delegationsCleared",
};

/** Stations that are no-ops because both treasuries are one account. */
const SHARED_TREASURY_SKIP: ReadonlySet<StationId> = new Set([
  "sponsor-lock",
  "sponsor-stake",
  "sponsor-delegate",
  "sponsor-unwind",
]);

/** True when a station is a no-op because both treasuries are one account. */
export function isSharedTreasurySkip(stationId: StationId, facts: ChainFacts): boolean {
  if (!facts.treasuriesShared) return false;
  return SHARED_TREASURY_SKIP.has(stationId);
}

/** Why a shared-treasury skip is a no-op rather than missing work. */
export function sharedTreasurySkipReason(
  stationId: StationId,
  t: AppTranslator = translateEnglishAppMessage,
): string | null {
  if (!SHARED_TREASURY_SKIP.has(stationId)) return null;
  if (stationId === "sponsor-delegate") return t("lifecycle.sharedCannotDelegate");
  return t("lifecycle.sharedSponsorSkip");
}

/** Attached deposits the team's remaining stations still need from its treasury. */
export function teamTreasuryRequirementYocto(facts: ChainFacts): bigint {
  let total = 0n;
  if (!facts.teamStaked) total += MIN_TEAM_STAKE_YOCTO;
  if (!facts.teamRegistered) total += BigInt(REGISTER_DEPOSIT);
  if (!facts.lockupDeployed) total += BigInt(LOCKUP_DEPLOY_DEPOSIT);
  if (!facts.voteCast) total += BigInt(VOTE_STORAGE_FEE_FALLBACK);
  return total;
}

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
  /** Populated when the station is skipped, explaining the no-op. */
  skipReason: string | null;
  /**
   * Why the station is blocked: `input` needs the user to fix something first,
   * so a chained run must stop there rather than walk through and fail
   * on-chain. There is no `upstream` anymore — requirements are declarative.
   */
  blockedBy: "input" | null;
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
  /**
   * Signers whose steps can be staged as proposals by the session wallet
   * instead of the signer's own wallet connection — the run gate treats the
   * signer as connected when the session holds that right.
   */
  sessionProposerSigners?: readonly SignerKind[];
  /** Per-station reasons the station cannot run yet, e.g. missing inputs. */
  blockers?: Partial<Record<StationId, string>>;
  runningStation?: StationId | null;
  failedStations?: Partial<Record<StationId, string>>;
}

export function deriveStations(
  options: DeriveOptions,
  t: AppTranslator = translateEnglishAppMessage,
): StationState[] {
  const { stations, facts, proposalsBySigner, accounts, connectedDao } = options;
  const blockers = options.blockers ?? {};
  const failures = options.failedStations ?? {};

  return stations.map((def) => {
    const signerAccountId = signerAccount(def.signer, accounts);
    const viaSessionProposal =
      !!signerAccountId && (options.sessionProposerSigners ?? []).includes(def.signer);
    const signerConnected =
      viaSessionProposal ||
      (def.signer === "session" ? true : !!signerAccountId && signerAccountId === connectedDao);
    const pending = proposalsBySigner[def.signer] ?? [];

    const steps: StepState[] = def.steps.map((step) => {
      const fact = STEP_FACT[step.id];
      const satisfied = fact ? facts[fact] === true : false;
      const pendingProposal = step.plan ? findPendingProposalForPlan(pending, step.plan) : null;
      const status: StepStatus = pendingProposal ? "staged" : satisfied ? "done" : "pending";
      return { ...step, status, pendingProposal };
    });

    /**
     * An unmet requirement blocks as `input`, not ordering: the fix is
     * running another station, often as another signer, so a chained run must
     * stop here rather than walk through and fail on-chain.
     */
    const unmetRequirement = (() => {
      if (!def.requires) return null;
      for (const [fact, reason] of Object.entries(def.requires)) {
        if (facts[fact as keyof ChainFacts] !== true) return reason;
      }
      return null;
    })();

    const blockedByInput = blockers[def.id] || unmetRequirement ? "input" : null;

    const status = ((): StationStatus => {
      if (isSharedTreasurySkip(def.id, facts)) return "skipped";
      if (failures[def.id]) return "failed";
      if (options.runningStation === def.id) return "running";
      if (steps.every((step) => step.status === "done")) return "done";
      if (steps.some((step) => step.status === "staged")) return "staged";
      if (blockedByInput) return "blocked";
      return "ready";
    })();

    const blockedBy = status === "blocked" ? blockedByInput : null;
    const blockedReason = failures[def.id] ?? blockers[def.id] ?? unmetRequirement ?? null;

    const { canRun, runBlockReason } = deriveRunGate(
      {
        status,
        blockedBy,
        blockerReason: blockers[def.id] ?? unmetRequirement,
        signerConnected,
        hasPendingSteps: steps.some((step) => step.status === "pending"),
      },
      t,
    );

    return {
      def,
      status,
      steps,
      blockedReason,
      skipReason: isSharedTreasurySkip(def.id, facts) ? sharedTreasurySkipReason(def.id, t) : null,
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
export function deriveRunGate(
  input: {
    status: StationStatus;
    blockedBy: "input" | null;
    blockerReason: string | null;
    signerConnected: boolean;
    hasPendingSteps: boolean;
  },
  t: AppTranslator = translateEnglishAppMessage,
): { canRun: boolean; runBlockReason: string | null } {
  if (input.status === "done" || input.status === "skipped" || input.status === "running") {
    return { canRun: false, runBlockReason: null };
  }
  if (input.blockedBy === "input") {
    return { canRun: false, runBlockReason: input.blockerReason ?? t("lifecycle.inputRequired") };
  }
  if (!input.signerConnected) {
    return { canRun: false, runBlockReason: t("lifecycle.connectTreasuryReason") };
  }
  if (!input.hasPendingSteps) {
    return { canRun: false, runBlockReason: t("lifecycle.awaitingVotesReason") };
  }
  return { canRun: true, runBlockReason: null };
}

/* ----------------------------------------------------------- one-click helpers */

/**
 * Every station the currently connected wallet can sign right now, in order.
 * Drives "run what I can sign": it never crosses a signer boundary, because
 * switching treasuries needs a new Trezu connection, but it does not require
 * the stations to be adjacent — the bootstrap and sponsor tracks run in any
 * order.
 */
export function runnableRun(stations: StationState[]): StationState[] {
  const runnable = stations.filter(
    (station) =>
      station.status !== "done" &&
      station.status !== "skipped" &&
      station.status !== "staged" &&
      station.steps.some((step) => step.status === "pending") &&
      station.canRun &&
      station.signerConnected,
  );
  const signer = runnable[0]?.def.signer;
  if (!signer) return [];
  return runnable.filter((station) => station.def.signer === signer);
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

export function createSignerLabel(t: AppTranslator) {
  return {
    session: t("lifecycle.sessionWallet"),
    endowment: t("lifecycle.endowmentLower"),
    team: t("lifecycle.teamLower"),
  };
}

export const SIGNER_LABEL: Record<SignerKind, string> = createSignerLabel(
  translateEnglishAppMessage,
);

export function createLensOptions(t: AppTranslator): readonly { id: LensId; label: string }[] {
  return [
    { id: "you", label: t("lifecycle.youLower") },
    { id: "team", label: t("lifecycle.teamLower") },
    { id: "endowment", label: t("lifecycle.endowmentLower") },
  ];
}

export const LENS_OPTIONS: readonly { id: LensId; label: string }[] = createLensOptions(
  translateEnglishAppMessage,
);

export const signerLens = (signer: SignerKind): LensId => (signer === "session" ? "you" : signer);

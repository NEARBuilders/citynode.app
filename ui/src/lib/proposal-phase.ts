import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import type { Proposal } from "@/lib/queries/proposals";

export type ReviewStatus = Proposal["reviewStatus"];
export type ApplyStatus = Proposal["applyStatus"];

export type ProposalPhaseInput = Pick<
  Proposal,
  "reviewStatus" | "applyStatus" | "removeStatus" | "applySteps" | "applyTimedOut"
>;

export const PROPOSAL_PHASES = [
  "in-review",
  "rejected",
  "approved",
  "setting-up",
  "vote-open",
  "awaiting-vote",
  "setup-stalled",
  "setup-failed",
  "live",
  "removing",
  "removal-failed",
  "removed",
] as const;

export type ProposalPhase = (typeof PROPOSAL_PHASES)[number];
export type ProposalPhaseVariant = "warning" | "destructive" | "success" | "outline";
export type ProposalPhaseOutcome = "waiting" | "failed" | "ok";

interface PhaseDescriptor {
  messageId: AppMessageId;
  variant: ProposalPhaseVariant;
  outcome: ProposalPhaseOutcome;
  setupAttention: boolean;
  rejectable: boolean;
  followsDecision: boolean;
}

const PHASES: Record<ProposalPhase, PhaseDescriptor> = {
  "in-review": {
    messageId: "dashboard.awaitingReview",
    variant: "warning",
    outcome: "waiting",
    setupAttention: false,
    rejectable: true,
    followsDecision: false,
  },
  rejected: {
    messageId: "dashboard.rejected",
    variant: "destructive",
    outcome: "failed",
    setupAttention: false,
    rejectable: false,
    followsDecision: false,
  },
  approved: {
    messageId: "dashboard.approved",
    variant: "success",
    outcome: "ok",
    setupAttention: false,
    rejectable: true,
    followsDecision: false,
  },
  "setting-up": {
    messageId: "proposal.applying",
    variant: "outline",
    outcome: "ok",
    setupAttention: false,
    rejectable: false,
    followsDecision: true,
  },
  "vote-open": {
    messageId: "admin.proposal.awaitingDaoVote",
    variant: "warning",
    outcome: "waiting",
    setupAttention: false,
    rejectable: false,
    followsDecision: true,
  },
  "awaiting-vote": {
    messageId: "admin.proposal.awaitingDaoVote",
    variant: "warning",
    outcome: "waiting",
    setupAttention: true,
    rejectable: true,
    followsDecision: true,
  },
  "setup-stalled": {
    messageId: "admin.proposal.setupStalled",
    variant: "destructive",
    outcome: "failed",
    setupAttention: true,
    rejectable: false,
    followsDecision: true,
  },
  "setup-failed": {
    messageId: "admin.proposal.setupFailed",
    variant: "destructive",
    outcome: "failed",
    setupAttention: true,
    rejectable: true,
    followsDecision: true,
  },
  live: {
    messageId: "proposal.live",
    variant: "success",
    outcome: "ok",
    setupAttention: false,
    rejectable: false,
    followsDecision: true,
  },
  removing: {
    messageId: "proposal.phase.removing",
    variant: "outline",
    outcome: "ok",
    setupAttention: false,
    rejectable: false,
    followsDecision: true,
  },
  "removal-failed": {
    messageId: "proposal.phase.removalFailed",
    variant: "destructive",
    outcome: "failed",
    setupAttention: false,
    rejectable: false,
    followsDecision: true,
  },
  removed: {
    messageId: "dashboard.removed",
    variant: "outline",
    outcome: "ok",
    setupAttention: false,
    rejectable: false,
    followsDecision: false,
  },
};

export function proposalPhase(proposal: ProposalPhaseInput): ProposalPhase {
  if (proposal.reviewStatus === "removed" || proposal.removeStatus === "removed") return "removed";
  if (proposal.reviewStatus === "pending") return "in-review";
  if (proposal.reviewStatus === "rejected") return "rejected";
  if (proposal.removeStatus === "removing") return "removing";
  if (proposal.removeStatus === "failed") return "removal-failed";
  if (proposal.applyStatus === "applied") return "live";
  if (proposal.applySteps.publication?.status === "waiting") {
    return proposal.applyStatus === "applying" && !proposal.applyTimedOut
      ? "vote-open"
      : "awaiting-vote";
  }
  if (proposal.applyStatus === "failed") return "setup-failed";
  if (proposal.applyTimedOut) return "setup-stalled";
  if (proposal.applyStatus === "applying") return "setting-up";
  return "approved";
}

export function proposalPhaseBadge(
  phase: ProposalPhase,
  t: AppTranslator = translateEnglishAppMessage,
): { label: string; variant: ProposalPhaseVariant } {
  const { messageId, variant } = PHASES[phase];
  return { label: t(messageId), variant };
}

export function proposalPhaseOutcome(phase: ProposalPhase): ProposalPhaseOutcome {
  return PHASES[phase].outcome;
}

export function phaseFollowsDecision(phase: ProposalPhase): boolean {
  return PHASES[phase].followsDecision;
}

export function setupNeedsAttention(phase: ProposalPhase): boolean {
  return PHASES[phase].setupAttention;
}

export function proposalNeedsAction(phase: ProposalPhase): boolean {
  return phase === "in-review" || setupNeedsAttention(phase);
}

export function proposalCanBeRejected(proposal: ProposalPhaseInput): boolean {
  return proposal.applyStatus !== "applying" && PHASES[proposalPhase(proposal)].rejectable;
}

export function rejectionReleasesSetup(proposal: ProposalPhaseInput): boolean {
  return proposal.applyStatus === "failed" && proposalCanBeRejected(proposal);
}

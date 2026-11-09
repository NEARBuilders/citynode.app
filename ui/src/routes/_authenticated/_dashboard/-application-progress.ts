import { type ProposalPhase, type ProposalPhaseInput, proposalPhase } from "@/lib/proposal-phase";
import type { Proposal } from "@/lib/queries/proposals";

// KEEP: mirrors CommunitySetupStepSchema in api/src/contract.ts; no route input or output carries it, so the typed ApiClient cannot expose it.
export const COMMUNITY_SETUP_STEPS = ["organization", "community", "publication"] as const;

export type CommunitySetupStep = (typeof COMMUNITY_SETUP_STEPS)[number];
export type ApplicationProgressStepId = "approval" | CommunitySetupStep | "complete";
export type ApplicationProgressState =
  | "done"
  | "current"
  | "waiting"
  | "failed"
  | "stalled"
  | "upcoming";

export interface ApplicationProgressStep {
  id: ApplicationProgressStepId;
  state: ApplicationProgressState;
  resourceId: string | null;
  recordedAt: string | null;
}

export type ApplicationProgressInput = ProposalPhaseInput & Pick<Proposal, "appliedAt">;

const ACTIVE_STEP_STATE: Partial<Record<ProposalPhase, ApplicationProgressState>> = {
  "setup-failed": "failed",
  "awaiting-vote": "failed",
  "setup-stalled": "stalled",
  "setting-up": "current",
  "vote-open": "current",
};

export function communityApplicationProgress(
  proposal: ApplicationProgressInput,
): ApplicationProgressStep[] | null {
  if (proposal.reviewStatus !== "approved") return null;
  const applied = proposal.applyStatus === "applied";
  let reachedActive = false;
  const setup = COMMUNITY_SETUP_STEPS.map((id): ApplicationProgressStep => {
    const recorded = proposal.applySteps[id];
    const base = {
      id,
      resourceId: recorded?.resourceId ?? null,
      recordedAt: recorded?.recordedAt ?? null,
    };
    if (applied || recorded?.status === "completed") return { ...base, state: "done" };
    if (reachedActive) return { ...base, state: "upcoming" };
    reachedActive = true;
    if (recorded?.status === "waiting") return { ...base, state: "waiting" };
    return { ...base, state: ACTIVE_STEP_STATE[proposalPhase(proposal)] ?? "upcoming" };
  });
  return [
    { id: "approval", state: "done", resourceId: null, recordedAt: null },
    ...setup,
    {
      id: "complete",
      state: applied ? "done" : "upcoming",
      resourceId: null,
      recordedAt: applied ? proposal.appliedAt : null,
    },
  ];
}

import type { Proposal } from "@/lib/queries/proposals";

// Mirrors CommunitySetupStepSchema in the API contract, which the typed ApiClient doesn't expose.
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

export type ApplicationProgressInput = Pick<
  Proposal,
  "reviewStatus" | "applyStatus" | "applySteps" | "applyTimedOut" | "appliedAt"
>;

function activeState(proposal: ApplicationProgressInput): ApplicationProgressState {
  if (proposal.applyStatus === "failed") return "failed";
  if (proposal.applyTimedOut) return "stalled";
  if (proposal.applyStatus === "applying") return "current";
  return "upcoming";
}

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
    return { ...base, state: activeState(proposal) };
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

export function communitySetupNeedsAttention(
  proposal: Pick<Proposal, "reviewStatus" | "applyStatus" | "applyTimedOut">,
) {
  return (
    proposal.reviewStatus === "approved" &&
    (proposal.applyStatus === "failed" || proposal.applyTimedOut)
  );
}

export function pendingPublicationProposalId(proposal: ApplicationProgressInput) {
  const publication = proposal.applySteps.publication;
  return publication?.status === "waiting" ? publication.resourceId : null;
}

import { describe, expect, it } from "vitest";
import {
  PROPOSAL_PHASES,
  type ProposalPhase,
  type ProposalPhaseInput,
  proposalCanBeRejected,
  proposalNeedsAction,
  proposalPhase,
  proposalPhaseBadge,
  rejectionReleasesSetup,
  setupNeedsAttention,
} from "./proposal-phase";

const waitingVote = {
  publication: {
    status: "waiting" as const,
    resourceId: "4",
    recordedAt: "2026-09-10T00:05:00.000Z",
  },
};

function input(overrides: Partial<ProposalPhaseInput>): ProposalPhaseInput {
  return {
    reviewStatus: "approved",
    applyStatus: "not_started",
    removeStatus: "not_started",
    applySteps: {},
    applyTimedOut: false,
    ...overrides,
  };
}

const CASES: Array<{
  phase: ProposalPhase;
  proposal: ProposalPhaseInput;
  label: string;
  needsAction: boolean;
  canReject: boolean;
}> = [
  {
    phase: "in-review",
    proposal: input({ reviewStatus: "pending" }),
    label: "Awaiting review",
    needsAction: true,
    canReject: true,
  },
  {
    phase: "rejected",
    proposal: input({ reviewStatus: "rejected" }),
    label: "Rejected",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "approved",
    proposal: input({}),
    label: "Approved",
    needsAction: false,
    canReject: true,
  },
  {
    phase: "setting-up",
    proposal: input({ applyStatus: "applying" }),
    label: "Applying",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "vote-open",
    proposal: input({ applyStatus: "applying", applySteps: waitingVote }),
    label: "Waiting for DAO vote",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "awaiting-vote",
    proposal: input({ applyStatus: "failed", applySteps: waitingVote }),
    label: "Waiting for DAO vote",
    needsAction: true,
    canReject: true,
  },
  {
    phase: "setup-stalled",
    proposal: input({ applyStatus: "applying", applyTimedOut: true }),
    label: "Setup stalled",
    needsAction: true,
    canReject: false,
  },
  {
    phase: "setup-failed",
    proposal: input({ applyStatus: "failed" }),
    label: "Setup failed",
    needsAction: true,
    canReject: true,
  },
  {
    phase: "live",
    proposal: input({ applyStatus: "applied" }),
    label: "Live",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "removing",
    proposal: input({ applyStatus: "applied", removeStatus: "removing" }),
    label: "Removing",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "removal-failed",
    proposal: input({ applyStatus: "applied", removeStatus: "failed" }),
    label: "Removal failed",
    needsAction: false,
    canReject: false,
  },
  {
    phase: "removed",
    proposal: input({ reviewStatus: "removed", applyStatus: "applied", removeStatus: "removed" }),
    label: "Removed",
    needsAction: false,
    canReject: false,
  },
];

describe("proposal phase", () => {
  it.each(CASES)("resolves $phase", ({ phase, proposal, label, needsAction, canReject }) => {
    expect(proposalPhase(proposal)).toBe(phase);
    expect(proposalPhaseBadge(phase).label).toBe(label);
    expect(proposalNeedsAction(phase)).toBe(needsAction);
    expect(proposalCanBeRejected(proposal)).toBe(canReject);
  });

  it("has exactly one case for every phase", () => {
    expect(CASES.map((entry) => entry.phase).sort()).toEqual([...PROPOSAL_PHASES].sort());
  });

  it("flags setups that need an admin and releases only what a failed setup created", () => {
    expect(CASES.filter((entry) => setupNeedsAttention(entry.phase)).map((e) => e.phase)).toEqual([
      "awaiting-vote",
      "setup-stalled",
      "setup-failed",
    ]);
    expect(
      CASES.filter((entry) => rejectionReleasesSetup(entry.proposal)).map((e) => e.phase),
    ).toEqual(["awaiting-vote", "setup-failed"]);
  });

  it("keeps a timed-out setup that is still applying unrejectable while its vote is open", () => {
    const idleVote = input({
      applyStatus: "applying",
      applyTimedOut: true,
      applySteps: waitingVote,
    });
    expect(proposalPhase(idleVote)).toBe("awaiting-vote");
    expect(setupNeedsAttention(proposalPhase(idleVote))).toBe(true);
    expect(proposalCanBeRejected(idleVote)).toBe(false);
    expect(rejectionReleasesSetup(idleVote)).toBe(false);
  });
});

import {
  canAccountAct,
  isOpenProposal,
  type ProposalPermission,
  proposalBondYocto,
  proposalPermission,
  roleMembers,
  type SputnikPolicy,
  type SputnikProposal,
  type SputnikRole,
} from "./sputnik-proposals";

export const CONTRIBUTOR_ROLE_NAME = "Contributor";

export function contributorRole(policy: SputnikPolicy | null | undefined): SputnikRole | null {
  if (!Array.isArray(policy?.roles)) return null;
  return (
    policy.roles.find(
      (role) =>
        role.name === CONTRIBUTOR_ROLE_NAME &&
        typeof role.kind === "object" &&
        Array.isArray(role.kind?.Group),
    ) ?? null
  );
}

export function isPollProposal(proposal: Pick<SputnikProposal, "kind">): boolean {
  return (proposal.kind as unknown) === "Vote";
}

export function pendingContributorRequest(
  proposals: readonly SputnikProposal[],
  accountId: string,
  role: string,
): SputnikProposal | null {
  return (
    proposals.find((proposal) => {
      if (proposal.status !== "InProgress") return false;
      const request = (proposal.kind as { AddMemberToRole?: { member_id?: string; role?: string } })
        .AddMemberToRole;
      return request?.member_id === accountId && request.role === role;
    }) ?? null
  );
}

export type ContributorState =
  | { status: "not-set-up" }
  | { status: "contributor"; role: string; poll: ProposalPermission }
  | { status: "requested"; role: string; proposalId: number }
  | { status: "can-request"; role: string; request: ProposalPermission }
  | { status: "governance-only"; role: string };

export function contributorState(
  policy: SputnikPolicy,
  accountId: string,
  openProposals: readonly SputnikProposal[],
): ContributorState {
  const role = contributorRole(policy);
  if (!role) return { status: "not-set-up" };
  if (roleMembers(role).includes(accountId)) {
    return {
      status: "contributor",
      role: role.name,
      poll: proposalPermission(policy, accountId, "vote"),
    };
  }
  const pending = pendingContributorRequest(openProposals, accountId, role.name);
  if (pending) return { status: "requested", role: role.name, proposalId: pending.id };
  const request = proposalPermission(policy, accountId, "add_member_to_role");
  if (request.reason === "no-permission") return { status: "governance-only", role: role.name };
  return { status: "can-request", role: role.name, request };
}

export type PollVoteAccess =
  | { status: "hidden" }
  | { status: "voted"; vote: "Approve" | "Reject" | "Remove" }
  | { status: "can-vote" }
  | { status: "can-finalize" };

export function pollVoteAccess(
  policy: SputnikPolicy | null | undefined,
  accountId: string | null,
  proposal: SputnikProposal,
  chainNowNs: bigint | null | undefined,
): PollVoteAccess {
  if (!accountId || !isPollProposal(proposal)) return { status: "hidden" };
  const vote = proposal.votes?.[accountId];
  const voted: PollVoteAccess = vote ? { status: "voted", vote } : { status: "hidden" };
  if (proposal.status !== "InProgress" || chainNowNs == null) return voted;
  if (!isOpenProposal(proposal, policy, chainNowNs)) {
    // KEEP: Sputnik leaves an expired poll stored as InProgress. A vote can't change it; Finalize closes it and returns the proposer's bond.
    const bond = policy ? proposalBondYocto(policy) : null;
    const canFinalize =
      bond !== null && bond > 0n && canAccountAct(policy, accountId, "vote", "Finalize");
    return canFinalize ? { status: "can-finalize" } : voted;
  }
  if (vote) return voted;
  const canVote =
    canAccountAct(policy, accountId, "vote", "VoteApprove") &&
    canAccountAct(policy, accountId, "vote", "VoteReject");
  return canVote ? { status: "can-vote" } : { status: "hidden" };
}

export const POLL_TITLE_MAX = 120;
export const POLL_DETAILS_MAX = 2000;

export function pollDescription(title: string, details: string): string {
  const lines = [`* Title: ${title.trim()}`];
  const body = details.trim();
  if (body) lines.push(`* Description: ${body.replace(/\r?\n/g, "<br>")}`);
  return lines.join(" <br>");
}

export function contributorRequestDescription(
  accountId: string,
  role: string,
  community: string,
): string {
  return `* Title: Add ${accountId} to the ${role} group <br>* Description: ${accountId} asked from City Node to join the ${role} group in ${community}.`;
}

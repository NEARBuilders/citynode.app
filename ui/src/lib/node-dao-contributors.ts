/**
 * Contributors (decision A, #408): members who are in their Node DAO's
 * Contributor group, which lets them propose and vote on polls. A member asks
 * to join the group with an `AddMemberToRole` proposal, or the DAO's
 * Governance group adds them directly. Everything here is read from the DAO's
 * policy and open proposals; nothing is cached in City Node.
 */

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

/**
 * The Contributor group's exact name, as the policy recipe (#412) sets it up in
 * every Node DAO. Members' requests name it, and pending requests are found by it.
 */
export const CONTRIBUTOR_ROLE_NAME = "Contributor";

/** The DAO's Contributor group, or null when its policy has none. */
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

/** Sputnik stores a poll's kind as the bare string `"Vote"`. */
export function isPollProposal(proposal: Pick<SputnikProposal, "kind">): boolean {
  return (proposal.kind as unknown) === "Vote";
}

/** The open `AddMemberToRole` proposal asking to add `accountId` to `role`, if any. */
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
  /** The DAO has no Contributor group yet. */
  | { status: "not-set-up" }
  /** In the group. `poll` says whether the policy lets them file polls, and the bond. */
  | { status: "contributor"; role: string; poll: ProposalPermission }
  /** Asked, and the Node DAO hasn't decided yet. */
  | { status: "requested"; role: string; proposalId: number }
  /** Not in the group, and the policy lets them ask. */
  | { status: "can-request"; role: string; request: ProposalPermission }
  /** Not in the group, and the policy doesn't let members ask; Governance adds them. */
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
  /** Past its period and still stored as in progress: closing it returns the proposer's bond. */
  | { status: "can-finalize" };

/**
 * What `accountId` can do on `proposal` from its page. On a poll still within
 * the policy's proposal period, they see vote buttons when the policy lets them
 * both approve and reject polls. Sputnik keeps an expired poll stored as
 * `InProgress`, and a vote on it can't change the result, so an expired poll
 * shows no vote buttons; with a positive bond, an account allowed to
 * `vote:Finalize` can close it instead, which returns the proposer's bond
 * (#413). Without the chain time, neither shows. Signers vote in Trezu.
 */
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

/** A poll's description in Trezu's format, so both apps show the same title and text. */
export function pollDescription(title: string, details: string): string {
  const lines = [`* Title: ${title.trim()}`];
  const body = details.trim();
  if (body) lines.push(`* Description: ${body.replace(/\r?\n/g, "<br>")}`);
  return lines.join(" <br>");
}

/** The description of a member's request to join the Contributor group. */
export function contributorRequestDescription(
  accountId: string,
  role: string,
  community: string,
): string {
  return `* Title: Add ${accountId} to the ${role} group <br>* Description: ${accountId} asked from City Node to join the ${role} group in ${community}.`;
}

import { describe, expect, it } from "vitest";
import {
  contributorRequestDescription,
  contributorRole,
  contributorState,
  isPollProposal,
  pendingContributorRequest,
  pollDescription,
  pollVoteAccess,
} from "./node-dao-contributors";
import type { SputnikPolicy, SputnikProposal } from "./sputnik-proposals";
import { buildAddProposalArgs } from "./sputnik-proposals";

const MEMBER = "member-one.near";
const NEAR = 10n ** 24n;

function policy({
  contributors = [] as string[],
  everyone = ["add_member_to_role:AddProposal"],
  contributorPermissions = ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject"],
  bond = "0" as string | undefined,
  withContributors = true,
} = {}): SputnikPolicy {
  return {
    roles: [
      {
        name: "Governance",
        kind: { Group: ["signer-one.near"] },
        permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject"],
      },
      ...(withContributors
        ? [
            {
              name: "Contributors",
              kind: { Group: contributors },
              permissions: contributorPermissions,
            },
          ]
        : []),
      { name: "all", kind: "Everyone", permissions: everyone },
    ],
    proposal_bond: bond,
  };
}

function proposal(
  overrides: Omit<Partial<SputnikProposal>, "kind"> & { kind: unknown },
): SputnikProposal {
  return {
    id: 7,
    proposer: MEMBER,
    description: "",
    status: "InProgress",
    vote_counts: {},
    votes: {},
    submission_time: "0",
    ...overrides,
    kind: overrides.kind as SputnikProposal["kind"],
  };
}

const request = (memberId = MEMBER, role = "Contributors", status = "InProgress") =>
  proposal({ id: 12, status, kind: { AddMemberToRole: { member_id: memberId, role } } });

describe("contributorRole", () => {
  it("finds the Contributors group by name", () => {
    expect(contributorRole(policy())?.name).toBe("Contributors");
  });

  it("is null without a Contributor group or a readable policy", () => {
    expect(contributorRole(policy({ withContributors: false }))).toBeNull();
    expect(contributorRole(null)).toBeNull();
    expect(
      contributorRole({ roles: [{ name: "contributor", kind: "Everyone", permissions: [] }] }),
    ).toBeNull();
  });
});

describe("contributorState", () => {
  it("is not set up when the DAO has no Contributor group", () => {
    expect(contributorState(policy({ withContributors: false }), MEMBER, [])).toEqual({
      status: "not-set-up",
    });
  });

  it("lets a member who isn't a Contributor ask, with the bond", () => {
    const state = contributorState(policy({ bond: NEAR.toString() }), MEMBER, []);
    expect(state).toMatchObject({
      status: "can-request",
      role: "Contributors",
      request: { canPropose: true, bondYocto: NEAR },
    });
  });

  it("waits on the Node DAO once the member's request is open", () => {
    expect(contributorState(policy(), MEMBER, [request()])).toEqual({
      status: "requested",
      role: "Contributors",
      proposalId: 12,
    });
  });

  it("ignores requests for someone else, another role, or ones already decided", () => {
    const others = [
      request("someone-else.near"),
      request(MEMBER, "Governance"),
      request(MEMBER, "Contributors", "Rejected"),
    ];
    expect(contributorState(policy(), MEMBER, others).status).toBe("can-request");
  });

  it("sends a member to Governance when the policy doesn't let members ask", () => {
    expect(contributorState(policy({ everyone: [] }), MEMBER, []).status).toBe("governance-only");
  });

  it("keeps a request disallowed when the bond can't be read", () => {
    const state = contributorState(policy({ bond: "lots" }), MEMBER, []);
    expect(state).toMatchObject({
      status: "can-request",
      request: { canPropose: false, reason: "bond-unavailable" },
    });
  });

  it("shows a member that signers added directly as a Contributor who can file polls", () => {
    const state = contributorState(policy({ contributors: [MEMBER] }), MEMBER, [request()]);
    expect(state).toMatchObject({
      status: "contributor",
      poll: { canPropose: true, reason: "allowed", bondYocto: 0n },
    });
  });

  it("says when a Contributor's group can't file polls", () => {
    const state = contributorState(
      policy({ contributors: [MEMBER], contributorPermissions: ["vote:VoteApprove"] }),
      MEMBER,
      [],
    );
    expect(state).toMatchObject({ status: "contributor", poll: { canPropose: false } });
  });
});

describe("pendingContributorRequest", () => {
  it("returns the open request for this member and role", () => {
    expect(pendingContributorRequest([request()], MEMBER, "Contributors")?.id).toBe(12);
    expect(pendingContributorRequest([], MEMBER, "Contributors")).toBeNull();
  });
});

describe("pollVoteAccess", () => {
  const poll = proposal({ kind: "Vote" });
  const contributorPolicy = policy({ contributors: [MEMBER] });

  it("lets a Contributor vote on an open poll", () => {
    expect(pollVoteAccess(contributorPolicy, MEMBER, poll)).toEqual({ status: "can-vote" });
  });

  it("hides voting from accounts that can't vote, signed-out readers, and closed polls", () => {
    expect(pollVoteAccess(contributorPolicy, "stranger.near", poll).status).toBe("hidden");
    expect(pollVoteAccess(contributorPolicy, null, poll).status).toBe("hidden");
    expect(pollVoteAccess(null, MEMBER, poll).status).toBe("hidden");
    expect(
      pollVoteAccess(contributorPolicy, MEMBER, proposal({ kind: "Vote", status: "Approved" }))
        .status,
    ).toBe("hidden");
  });

  it("needs both approve and reject on polls", () => {
    const approveOnly = policy({
      contributors: [MEMBER],
      contributorPermissions: ["vote:AddProposal", "vote:VoteApprove"],
    });
    expect(pollVoteAccess(approveOnly, MEMBER, poll).status).toBe("hidden");
  });

  it("only offers votes on polls, not other kinds", () => {
    const call = proposal({ kind: { FunctionCall: { receiver_id: "x.near", actions: [] } } });
    expect(pollVoteAccess(policy({ contributors: [MEMBER] }), MEMBER, call).status).toBe("hidden");
  });

  it("shows the member's vote once cast", () => {
    const voted = proposal({ kind: "Vote", votes: { [MEMBER]: "Approve" } });
    expect(pollVoteAccess(contributorPolicy, MEMBER, voted)).toEqual({
      status: "voted",
      vote: "Approve",
    });
  });
});

describe("member proposal payloads", () => {
  it("files a poll as Sputnik's Vote kind", () => {
    expect(buildAddProposalArgs({ kind: "vote" }, "d")).toEqual({
      proposal: { description: "d", kind: "Vote" },
    });
    expect(isPollProposal({ kind: "Vote" as never })).toBe(true);
  });

  it("files a Contributor request as AddMemberToRole", () => {
    expect(
      buildAddProposalArgs(
        { kind: "add_member_to_role", memberId: MEMBER, role: "Contributors" },
        "d",
      ),
    ).toEqual({
      proposal: {
        description: "d",
        kind: { AddMemberToRole: { member_id: MEMBER, role: "Contributors" } },
      },
    });
  });

  it("writes descriptions in Trezu's title format", () => {
    expect(pollDescription("  Picnic in May? ", "Line one\nLine two")).toBe(
      "* Title: Picnic in May? <br>* Description: Line one<br>Line two",
    );
    expect(pollDescription("Only a title", "  ")).toBe("* Title: Only a title");
    expect(contributorRequestDescription(MEMBER, "Example City")).toContain(
      "* Title: Add member-one.near to Contributors",
    );
  });
});

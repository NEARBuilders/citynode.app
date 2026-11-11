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
  contributorPermissions = [
    "vote:AddProposal",
    "vote:VoteApprove",
    "vote:VoteReject",
    "vote:Finalize",
  ],
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
              name: "Contributor",
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

const request = (memberId = MEMBER, role = "Contributor", status = "InProgress") =>
  proposal({ id: 12, status, kind: { AddMemberToRole: { member_id: memberId, role } } });

describe("contributorRole", () => {
  it("finds the Contributor group by its exact name", () => {
    expect(contributorRole(policy())?.name).toBe("Contributor");
  });

  it("doesn't take a group that is only named like it", () => {
    for (const name of ["Contributors", "contributor", "CONTRIBUTOR"]) {
      expect(
        contributorRole({ roles: [{ name, kind: { Group: [MEMBER] }, permissions: [] }] }),
      ).toBeNull();
    }
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
      role: "Contributor",
      request: { canPropose: true, bondYocto: NEAR },
    });
  });

  it("waits on the Node DAO once the member's request is open", () => {
    expect(contributorState(policy(), MEMBER, [request()])).toEqual({
      status: "requested",
      role: "Contributor",
      proposalId: 12,
    });
  });

  it("ignores requests for someone else, another role, or ones already decided", () => {
    const others = [
      request("someone-else.near"),
      request(MEMBER, "Governance"),
      request(MEMBER, "Contributor", "Rejected"),
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
    expect(pendingContributorRequest([request()], MEMBER, "Contributor")?.id).toBe(12);
    expect(pendingContributorRequest([], MEMBER, "Contributor")).toBeNull();
  });
});

describe("pollVoteAccess", () => {
  const WEEK_NS = 604_800_000_000_000n;
  const NOW_NS = 1_760_000_000_000n * 1_000_000n;
  const poll = proposal({ kind: "Vote", submission_time: (NOW_NS - 1n).toString() });
  const contributorPolicy = {
    ...policy({ contributors: [MEMBER] }),
    proposal_period: WEEK_NS.toString(),
  };
  const access = (
    p: SputnikPolicy | null,
    accountId: string | null,
    target: SputnikProposal,
    nowNs: bigint | null = NOW_NS,
  ) => pollVoteAccess(p, accountId, target, nowNs);

  it("lets a Contributor vote on an open poll", () => {
    expect(access(contributorPolicy, MEMBER, poll)).toEqual({ status: "can-vote" });
  });

  it("hides voting on a poll past its period, though Sputnik still stores it as in progress", () => {
    const expired = proposal({
      kind: "Vote",
      status: "InProgress",
      submission_time: (NOW_NS - WEEK_NS - 1n).toString(),
    });
    expect(access(contributorPolicy, MEMBER, expired).status).toBe("hidden");
  });

  describe("closing an expired poll", () => {
    const expired = proposal({
      kind: "Vote",
      status: "InProgress",
      submission_time: (NOW_NS - WEEK_NS - 1n).toString(),
    });
    const bonded = { ...contributorPolicy, proposal_bond: (10n ** 23n).toString() };

    it("lets a Contributor close it when the bond is positive", () => {
      expect(access(bonded, MEMBER, expired)).toEqual({ status: "can-finalize" });
      const voted = { ...expired, votes: { [MEMBER]: "Approve" as const } };
      expect(access(bonded, MEMBER, voted)).toEqual({ status: "can-finalize" });
    });

    it("doesn't offer it with no bond to return, or without vote:Finalize", () => {
      expect(access(contributorPolicy, MEMBER, expired).status).toBe("hidden");
      const noFinalize = {
        ...policy({
          contributors: [MEMBER],
          contributorPermissions: ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject"],
        }),
        proposal_period: WEEK_NS.toString(),
        proposal_bond: (10n ** 23n).toString(),
      };
      expect(access(noFinalize, MEMBER, expired).status).toBe("hidden");
      expect(access(bonded, "stranger.near", expired).status).toBe("hidden");
    });

    it("doesn't offer it on an open poll, a decided one, or before the chain time loads", () => {
      expect(access(bonded, MEMBER, poll)).toEqual({ status: "can-vote" });
      const decided = { ...expired, status: "Approved" };
      expect(access(bonded, MEMBER, decided).status).toBe("hidden");
      expect(access(bonded, MEMBER, expired, null).status).toBe("hidden");
    });
  });

  it("hides voting until the chain time is known", () => {
    expect(access(contributorPolicy, MEMBER, poll, null).status).toBe("hidden");
  });

  it("hides voting from accounts that can't vote, signed-out readers, and closed polls", () => {
    expect(access(contributorPolicy, "stranger.near", poll).status).toBe("hidden");
    expect(access(contributorPolicy, null, poll).status).toBe("hidden");
    expect(access(null, MEMBER, poll).status).toBe("hidden");
    expect(
      access(contributorPolicy, MEMBER, proposal({ kind: "Vote", status: "Approved" })).status,
    ).toBe("hidden");
  });

  it("needs both approve and reject on polls", () => {
    const approveOnly = policy({
      contributors: [MEMBER],
      contributorPermissions: ["vote:AddProposal", "vote:VoteApprove"],
    });
    expect(access(approveOnly, MEMBER, poll).status).toBe("hidden");
  });

  it("only offers votes on polls, not other kinds", () => {
    const call = proposal({ kind: { FunctionCall: { receiver_id: "x.near", actions: [] } } });
    expect(access(policy({ contributors: [MEMBER] }), MEMBER, call).status).toBe("hidden");
  });

  it("shows the member's vote once cast", () => {
    const voted = proposal({ kind: "Vote", votes: { [MEMBER]: "Approve" } });
    expect(access(contributorPolicy, MEMBER, voted)).toEqual({
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
        { kind: "add_member_to_role", memberId: MEMBER, role: "Contributor" },
        "d",
      ),
    ).toEqual({
      proposal: {
        description: "d",
        kind: { AddMemberToRole: { member_id: MEMBER, role: "Contributor" } },
      },
    });
  });

  it("writes descriptions in Trezu's title format", () => {
    expect(pollDescription("  Picnic in May? ", "Line one\nLine two")).toBe(
      "* Title: Picnic in May? <br>* Description: Line one<br>Line two",
    );
    expect(pollDescription("Only a title", "  ")).toBe("* Title: Only a title");
    expect(contributorRequestDescription(MEMBER, "Contributor", "Example City")).toContain(
      "* Title: Add member-one.near to the Contributor group",
    );
  });
});

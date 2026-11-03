// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import type { MemberSigningState } from "@/lib/member-wallet";
import type { SputnikPolicy, SputnikProposal } from "@/lib/sputnik-proposals";
import { MemberDaoPanel, PollVote } from "./node-dao-member";

const DAO = "lisbon.sputnik-dao.near";
const MEMBER = "member-one.near";
const NEAR = 10n ** 24n;

const harness = vi.hoisted(() => ({
  account: "member-one.near" as string | null,
  policy: null as unknown,
  open: [] as unknown[],
  spendable: 0n as bigint | Error,
  chainNowNs: 1_760_000_000_000n * 1_000_000n,
  signing: { status: "idle", failure: null, result: null } as MemberSigningState,
  tasks: [] as ((wallet: unknown) => Promise<unknown>)[],
  submitProposalWithBond: vi.fn(async (..._args: unknown[]) => ({})),
  voteOnProposal: vi.fn(async (..._args: unknown[]) => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      {...rest}
      href={to
        .replace("$slug", params?.slug ?? "")
        .replace("$proposalId", params?.proposalId ?? "")}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/use-near-account", () => ({ useNearAccount: () => harness.account }));

vi.mock("@/lib/use-member-signing", () => ({
  useMemberSigning: () => ({
    state: harness.signing,
    submit: (task: (wallet: unknown) => Promise<unknown>) => {
      harness.tasks.push(task);
      return task({});
    },
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/sputnik-proposals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sputnik-proposals")>();
  return {
    ...actual,
    readSputnikPolicy: async () => {
      if (harness.policy instanceof Error) throw harness.policy;
      return harness.policy;
    },
    readOpenDaoProposals: async () => harness.open,
    readChainTimeNs: async () => harness.chainNowNs,
    readSpendableYocto: async () => {
      if (harness.spendable instanceof Error) throw harness.spendable;
      return harness.spendable;
    },
    submitProposalWithBond: harness.submitProposalWithBond,
    voteOnProposal: harness.voteOnProposal,
  };
});

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  harness.account = MEMBER;
  harness.policy = null;
  harness.open = [];
  harness.spendable = 0n;
  harness.signing = { status: "idle", failure: null, result: null };
  harness.tasks = [];
  harness.submitProposalWithBond.mockClear();
  harness.voteOnProposal.mockClear();
});

function policy({
  contributors = [] as string[],
  everyone = ["add_member_to_role:AddProposal"],
  bond = "0",
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
              permissions: ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject"],
            },
          ]
        : []),
      { name: "all", kind: "Everyone", permissions: everyone },
    ],
    proposal_bond: bond,
  };
}

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const community = { name: "Lisbon", slug: "lisbon" };
const renderPanel = () =>
  renderWithQuery(<MemberDaoPanel daoAccountId={DAO} community={community} />);

describe("MemberDaoPanel", () => {
  it("asks a member without a wallet to set one up", async () => {
    harness.account = null;
    harness.policy = policy();
    renderPanel();
    expect((await screen.findByTestId("member-dao.no-wallet")).textContent).toContain(
      "wallet isn't set up yet",
    );
    expect(screen.getByTestId("member-dao.all-proposals").getAttribute("href")).toBe(
      "/n/lisbon/proposals",
    );
  });

  it("says when the Node DAO has no Contributors group", async () => {
    harness.policy = policy({ withContributors: false });
    renderPanel();
    expect((await screen.findByTestId("member-dao.not-set-up")).textContent).toContain(
      "hasn't set up a Contributors group",
    );
  });

  it("shows a retryable error when the DAO can't be read", async () => {
    harness.policy = new Error("rpc down");
    renderPanel();
    const error = await screen.findByTestId("member-dao.load-error");
    expect(error.textContent).toContain(`Couldn't read ${DAO}`);
    harness.policy = policy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("member-dao.can-request")).toBeTruthy();
  });

  it("lets a member ask to become a Contributor in one signature", async () => {
    harness.policy = policy();
    renderPanel();
    fireEvent.click(await screen.findByTestId("member-dao.become"));
    await waitFor(() => expect(harness.submitProposalWithBond).toHaveBeenCalledTimes(1));
    const [, dao, plan, description, bond] = harness.submitProposalWithBond.mock.calls[0];
    expect(dao).toBe(DAO);
    expect(plan).toEqual({ kind: "add_member_to_role", memberId: MEMBER, role: "Contributors" });
    expect(description).toContain("Add member-one.near to Contributors");
    expect(bond).toBe(0n);
    expect(screen.queryByTestId("member-dao.bond")).toBeNull();
  });

  it("shows the bond before signing and blocks a wallet that holds too little", async () => {
    harness.policy = policy({ bond: NEAR.toString() });
    harness.spendable = NEAR / 4n;
    renderPanel();
    expect((await screen.findByTestId("member-dao.bond")).textContent).toContain("1 NEAR bond");
    const insufficient = await screen.findByTestId("member-dao.insufficient");
    expect(insufficient.textContent).toContain("needs 0.75 more NEAR");
    expect(insufficient.textContent).toContain(MEMBER);
    expect((screen.getByTestId("member-dao.become") as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets a funded wallet pay a positive bond", async () => {
    harness.policy = policy({ bond: NEAR.toString() });
    harness.spendable = 2n * NEAR;
    renderPanel();
    const become = await screen.findByTestId("member-dao.become");
    await waitFor(() => expect((become as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId("member-dao.insufficient")).toBeNull();
    fireEvent.click(become);
    await waitFor(() => expect(harness.submitProposalWithBond.mock.calls[0]?.[4]).toBe(NEAR));
  });

  it("never submits when the bond can't be read", async () => {
    harness.policy = policy({ bond: "not-a-number" });
    renderPanel();
    expect(await screen.findByTestId("member-dao.bond-unknown")).toBeTruthy();
    expect((screen.getByTestId("member-dao.become") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the request as waiting on the Node DAO", async () => {
    harness.policy = policy();
    harness.open = [
      {
        id: 31,
        status: "InProgress",
        kind: { AddMemberToRole: { member_id: MEMBER, role: "Contributors" } },
      },
    ];
    renderPanel();
    const requested = await screen.findByTestId("member-dao.requested");
    expect(requested.textContent).toContain("hasn't decided yet");
    expect(requested.querySelector("a")?.getAttribute("href")).toBe("/n/lisbon/proposals/31");
  });

  it("sends a member to Governance when members can't ask", async () => {
    harness.policy = policy({ everyone: [] });
    renderPanel();
    expect((await screen.findByTestId("member-dao.governance-only")).textContent).toContain(
      "Governance group adds Contributors",
    );
  });

  it("gives a Contributor the poll form and files a poll", async () => {
    harness.policy = policy({ contributors: [MEMBER] });
    renderPanel();
    const submit = (await screen.findByTestId("member-dao.poll-submit")) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Picnic in May?" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "At the park" } });
    fireEvent.click(submit);
    await waitFor(() => expect(harness.submitProposalWithBond).toHaveBeenCalledTimes(1));
    const [, dao, plan, description] = harness.submitProposalWithBond.mock.calls[0];
    expect(dao).toBe(DAO);
    expect(plan).toEqual({ kind: "vote" });
    expect(description).toBe("* Title: Picnic in May? <br>* Description: At the park");
  });

  it("shows signing errors in plain words", async () => {
    harness.policy = policy({ contributors: [MEMBER] });
    harness.signing = { status: "error", failure: "rejected", result: null };
    renderPanel();
    await screen.findByTestId("member-dao.poll-form");
    expect(screen.getByRole("alert").textContent).toMatch(/\S/);
    expect(screen.getByRole("alert").textContent).not.toContain("Smart contract panicked");
  });
});

function poll(overrides: Partial<SputnikProposal> = {}): SputnikProposal {
  return {
    id: 9,
    proposer: "member-two.near",
    description: "* Title: Picnic?",
    kind: "Vote" as never,
    status: "InProgress",
    vote_counts: {},
    votes: {},
    submission_time: (harness.chainNowNs - 1n).toString(),
    ...overrides,
  };
}

const WEEK_NS = 604_800_000_000_000n;

describe("PollVote", () => {
  it("lets a Contributor approve an open poll", async () => {
    harness.policy = policy({ contributors: [MEMBER] });
    const proposal = poll();
    renderWithQuery(<PollVote daoAccountId={DAO} proposal={proposal} />);
    fireEvent.click(await screen.findByTestId("poll-vote.approve"));
    await waitFor(() => expect(harness.voteOnProposal).toHaveBeenCalledTimes(1));
    expect(harness.voteOnProposal.mock.calls[0]?.slice(1)).toEqual([DAO, proposal, "VoteApprove"]);
  });

  it("lets a Contributor reject", async () => {
    harness.policy = policy({ contributors: [MEMBER] });
    renderWithQuery(<PollVote daoAccountId={DAO} proposal={poll()} />);
    fireEvent.click(await screen.findByTestId("poll-vote.reject"));
    await waitFor(() => expect(harness.voteOnProposal.mock.calls[0]?.[3]).toBe("VoteReject"));
  });

  it("shows no vote buttons to someone who can't vote", async () => {
    harness.policy = policy();
    renderWithQuery(<PollVote daoAccountId={DAO} proposal={poll()} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("poll-vote")).toBeNull();
  });

  it("shows no vote buttons on a poll past its period", async () => {
    harness.policy = { ...policy({ contributors: [MEMBER] }), proposal_period: WEEK_NS.toString() };
    const expired = poll({ submission_time: (harness.chainNowNs - WEEK_NS - 1n).toString() });
    renderWithQuery(<PollVote daoAccountId={DAO} proposal={expired} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("poll-vote")).toBeNull();
  });

  it("shows no vote buttons signed out", () => {
    harness.account = null;
    renderWithQuery(<PollVote daoAccountId={DAO} proposal={poll()} />);
    expect(screen.queryByTestId("poll-vote")).toBeNull();
  });

  it("shows the member's vote once cast", async () => {
    harness.policy = policy({ contributors: [MEMBER] });
    renderWithQuery(
      <PollVote daoAccountId={DAO} proposal={poll({ votes: { [MEMBER]: "Reject" } })} />,
    );
    expect((await screen.findByTestId("poll-vote.voted")).textContent).toBe("You voted to reject.");
  });
});

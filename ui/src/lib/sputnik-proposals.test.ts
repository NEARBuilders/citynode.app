import { Near } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAddProposalArgs,
  canAccountApprove,
  canAccountPropose,
  displayedProposalStatus,
  isOpenProposal,
  needsDelegationBalance,
  proposalCallsMethod,
  proposalMatchesPlan,
  readDaoProposal,
  readDaoProposalPage,
  readDaoProposalsSince,
  readDelegationBalance,
  readOpenDaoProposals,
  type SputnikPolicy,
  type SputnikProposal,
} from "./sputnik-proposals";

function proposalRecord(overrides: Partial<SputnikProposal> = {}): SputnikProposal {
  return {
    id: 1,
    proposer: "requestor.near",
    description: "",
    kind: {},
    status: "InProgress",
    vote_counts: {},
    votes: {},
    submission_time: "0",
    ...overrides,
  };
}

describe("buildAddProposalArgs", () => {
  it("wraps a call plan as a FunctionCall proposal with base64 args and raw gas", () => {
    expect(
      buildAddProposalArgs(
        {
          kind: "call",
          receiverId: "dev.everything.near",
          methodName: "__fastdata_kv",
          args: { k: "v" },
          gas: "300 Tgas",
        },
        "d",
      ),
    ).toEqual({
      proposal: {
        description: "d",
        kind: {
          FunctionCall: {
            receiver_id: "dev.everything.near",
            actions: [
              {
                method_name: "__fastdata_kv",
                args: "eyJrIjoidiJ9",
                deposit: "0",
                gas: "300000000000000",
              },
            ],
          },
        },
      },
    });
  });

  it("carries an explicit attached deposit onto the action", () => {
    const { proposal } = buildAddProposalArgs(
      {
        kind: "call",
        receiverId: "a.near",
        methodName: "m",
        args: {},
        gas: "100 Tgas",
        attachedDeposit: "5",
      },
      "d",
    );
    expect(proposal.kind).toMatchObject({
      FunctionCall: { actions: [{ deposit: "5", gas: "100000000000000" }] },
    });
  });

  it("wraps a transfer plan as a Transfer proposal with an empty token id", () => {
    expect(
      buildAddProposalArgs({ kind: "transfer", receiverId: "bob.near", amountYocto: "42" }, "pay"),
    ).toEqual({
      proposal: {
        description: "pay",
        kind: { Transfer: { token_id: "", receiver_id: "bob.near", amount: "42" } },
      },
    });
  });
});

describe("proposal method matching", () => {
  const call = (receiverId: string, method: string) =>
    proposalRecord({
      kind: {
        FunctionCall: {
          receiver_id: receiverId,
          actions: [{ method_name: method, args: "", deposit: "0", gas: "0" }],
        },
      },
    });
  const plan = {
    kind: "call" as const,
    receiverId: "pool.near",
    methodName: "unstake",
    args: {},
    gas: "0",
  };

  it("matches a plan on its exact method name only", () => {
    expect(proposalMatchesPlan(call("pool.near", "unstake"), plan)).toBe(true);
    expect(proposalMatchesPlan(call("pool.near", "unstake_all"), plan)).toBe(false);
  });

  it("matches any listed method on the receiver", () => {
    const methods = ["unstake", "unstake_all", "withdraw_all"];
    expect(proposalCallsMethod(call("pool.near", "unstake_all"), "pool.near", methods)).toBe(true);
    expect(proposalCallsMethod(call("pool.near", "withdraw_all"), "pool.near", methods)).toBe(true);
    expect(proposalCallsMethod(call("pool.near", "stake"), "pool.near", methods)).toBe(false);
    expect(proposalCallsMethod(call("other.near", "unstake"), "pool.near", methods)).toBe(false);
  });
});

describe("isOpenProposal", () => {
  const chainNowNs = 1_760_000_000_000n * 1_000_000n;
  const periodNs = 604_800_000_000_000n;
  const period = { proposal_period: periodNs.toString() };
  const proposal = (status: string, ageNs: bigint) =>
    proposalRecord({ status, submission_time: (chainNowNs - ageNs).toString() });

  it("treats an in-progress proposal within the period as open", () => {
    expect(isOpenProposal(proposal("InProgress", 60_000_000_000n), period, chainNowNs)).toBe(true);
  });

  it("treats an in-progress proposal past the period as expired", () => {
    expect(isOpenProposal(proposal("InProgress", periodNs + 1n), period, chainNowNs)).toBe(false);
  });

  it("keeps a proposal open at the exact end of its period, as Sputnik does", () => {
    expect(isOpenProposal(proposal("InProgress", periodNs), period, chainNowNs)).toBe(true);
    expect(isOpenProposal(proposal("Failed", periodNs), period, chainNowNs)).toBe(true);
  });

  it("treats a failed proposal as open while Sputnik can still retry it", () => {
    expect(isOpenProposal(proposal("Failed", 60_000_000_000n), period, chainNowNs)).toBe(true);
    expect(isOpenProposal(proposal("Failed", periodNs + 1n), period, chainNowNs)).toBe(false);
  });

  it("treats decided proposals as closed", () => {
    for (const status of ["Approved", "Rejected", "Removed", "Expired", "Moved"]) {
      expect(isOpenProposal(proposal(status, 60_000_000_000n), period, chainNowNs)).toBe(false);
    }
  });

  it("keeps an in-progress proposal open when the period is unknown", () => {
    expect(isOpenProposal(proposal("InProgress", 2n * periodNs), null, chainNowNs)).toBe(true);
  });
});

describe("displayedProposalStatus", () => {
  const chainNowNs = 1_760_000_000_000n * 1_000_000n;
  const periodNs = 604_800_000_000_000n;
  const period = { proposal_period: periodNs.toString() };
  const proposal = (status: string, ageNs: bigint) =>
    proposalRecord({ status, submission_time: (chainNowNs - ageNs).toString() });

  it("shows an in-progress proposal past its period as expired", () => {
    expect(displayedProposalStatus(proposal("InProgress", periodNs + 1n), period, chainNowNs)).toBe(
      "Expired",
    );
  });

  it("keeps an in-progress proposal within its period open", () => {
    expect(displayedProposalStatus(proposal("InProgress", periodNs), period, chainNowNs)).toBe(
      "InProgress",
    );
  });

  it("shows every other stored status as it is, even past the period", () => {
    for (const status of ["Approved", "Rejected", "Removed", "Failed", "Moved"]) {
      expect(displayedProposalStatus(proposal(status, 2n * periodNs), period, chainNowNs)).toBe(
        status,
      );
    }
  });

  it("shows the stored status until the period and chain time are known", () => {
    const old = proposal("InProgress", 2n * periodNs);
    expect(displayedProposalStatus(old, null, chainNowNs)).toBe("InProgress");
    expect(displayedProposalStatus(old, period, null)).toBe("InProgress");
  });
});

describe("Sputnik Member roles", () => {
  const memberPolicy = (amount: string): SputnikPolicy => ({
    roles: [
      { name: "Council", kind: { Group: ["council.near"] }, permissions: ["*:*"] },
      {
        name: "Holders",
        kind: { Member: amount },
        permissions: ["call:AddProposal", "call:VoteApprove"],
      },
    ],
  });

  it("lets any account act through a Member role with no minimum", () => {
    expect(canAccountPropose(memberPolicy("0"), "anyone.near")).toBe(true);
    expect(canAccountApprove(memberPolicy("0"), "anyone.near")).toBe(true);
    expect(needsDelegationBalance(memberPolicy("0"), "anyone.near")).toBe(false);
  });

  it("requires a delegation balance at or above a Member role's minimum", () => {
    const policy = memberPolicy("100");
    expect(needsDelegationBalance(policy, "holder.near")).toBe(true);
    expect(canAccountPropose(policy, "holder.near", 100n)).toBe(true);
    expect(canAccountApprove(policy, "holder.near", 250n)).toBe(true);
    expect(canAccountPropose(policy, "holder.near", 99n)).toBe(false);
    expect(canAccountApprove(policy, "holder.near", 99n)).toBe(false);
  });

  it("does not grant a Member role while the delegation balance is unknown", () => {
    expect(canAccountPropose(memberPolicy("100"), "holder.near")).toBe(false);
    expect(canAccountApprove(memberPolicy("100"), "holder.near")).toBe(false);
  });

  it("skips the delegation read for accounts a group already lets propose", () => {
    expect(needsDelegationBalance(memberPolicy("100"), "council.near")).toBe(false);
    expect(needsDelegationBalance(memberPolicy("100"), null)).toBe(false);
  });

  it("reads the DAO's delegation balance and rejects a malformed one", async () => {
    const view = vi
      .spyOn(Near.prototype, "view")
      .mockResolvedValueOnce("150")
      .mockResolvedValueOnce(null);
    await expect(readDelegationBalance("dao.near", "holder.near")).resolves.toBe(150n);
    expect(view).toHaveBeenCalledWith("dao.near", "delegation_balance_of", {
      account_id: "holder.near",
    });
    await expect(readDelegationBalance("dao.near", "holder.near")).rejects.toThrow();
    vi.restoreAllMocks();
  });
});

describe("readDaoProposalsSince", () => {
  const nowNs = 1_760_000_000_000n * 1_000_000n;
  const hourNs = 3_600_000_000_000n;
  const dao = "example.sputnik-dao.near";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubSparseDao(last: number, proposals: SputnikProposal[]) {
    return vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method, args) => {
      if (method === "get_last_proposal_id") return Promise.resolve(last);
      const { from_index, limit } = args as { from_index: number; limit: number };
      return Promise.resolve(
        proposals.filter(
          (proposal) => proposal.id >= from_index && proposal.id < from_index + limit,
        ),
      );
    });
  }

  const record = (id: number, submittedNs: bigint, status = "Approved") =>
    proposalRecord({ id, status, submission_time: submittedNs.toString() });

  function stubDao(count: number, submittedNs: (id: number) => bigint) {
    stubSparseDao(
      count,
      Array.from({ length: count }, (_, id) =>
        record(id, submittedNs(id), id === 12 ? "InProgress" : "Approved"),
      ),
    );
  }

  it("reads past the newest 25 to an open proposal inside the voting period", async () => {
    stubDao(60, (id) => nowNs - hourNs * BigInt(60 - id));
    const proposals = await readDaoProposalsSince(dao, nowNs - 168n * hourNs);
    expect(proposals.map((proposal) => proposal.id)).toEqual(
      Array.from({ length: 60 }, (_, index) => 59 - index),
    );
    expect(proposals.find((proposal) => proposal.status === "InProgress")?.id).toBe(12);
  });

  it("stops at the first page that reaches proposals older than the cutoff", async () => {
    stubDao(100, (id) => nowNs - hourNs * BigInt(100 - id));
    const proposals = await readDaoProposalsSince(dao, nowNs - 40n * hourNs, 25);
    expect(Math.min(...proposals.map((proposal) => proposal.id))).toBe(50);
  });

  it("refuses to guess when the proposal ID range inside the period exceeds the cap", async () => {
    stubDao(60, () => nowNs);
    await expect(readDaoProposalsSince(dao, nowNs - hourNs, 25, 50)).rejects.toThrow(
      "Proposal ID range beyond the newest 50 IDs",
    );
  });

  it("reads past removed proposal IDs beyond 500 positions", async () => {
    stubSparseDao(1200, [
      record(40, nowNs - 200n * hourNs),
      record(90, nowNs - hourNs, "InProgress"),
      record(1199, nowNs),
    ]);
    const proposals = await readDaoProposalsSince(dao, nowNs - 168n * hourNs);
    expect(proposals.map((proposal) => proposal.id)).toEqual([1199, 90, 40]);
  });

  it("reaches ID 0 through a sparse range with nothing older than the cutoff", async () => {
    stubSparseDao(1500, [record(3, nowNs - hourNs, "InProgress")]);
    const proposals = await readDaoProposalsSince(dao, nowNs - 168n * hourNs);
    expect(proposals.map((proposal) => proposal.id)).toEqual([3]);
  });

  it("fails closed when the ID range scanned never reaches the cutoff or ID 0", async () => {
    stubSparseDao(2600, [record(2599, nowNs)]);
    await expect(readDaoProposalsSince(dao, nowNs - 168n * hourNs)).rejects.toThrow(
      "Proposal ID range beyond the newest 2000 IDs",
    );
  });

  it("keeps reading past proposals submitted in the same block as the cutoff", async () => {
    const cutoff = nowNs - 168n * hourNs;
    stubSparseDao(150, [record(20, cutoff, "InProgress"), record(120, cutoff)]);
    const proposals = await readDaoProposalsSince(dao, cutoff);
    expect(proposals.map((proposal) => proposal.id)).toEqual([120, 20]);
  });
});

describe("readOpenDaoProposals", () => {
  const nowNs = 1_760_000_000_000n * 1_000_000n;
  const hourNs = 3_600_000_000_000n;
  const dao = "example.sputnik-dao.near";
  const policy = { roles: [], proposal_period: (168n * hourNs).toString() };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubDao(proposals: SputnikProposal[], failOn?: string) {
    vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
      getBlock: () => Promise.resolve({ header: { timestamp_nanosec: nowNs.toString() } }),
    } as never);
    return vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method, args) => {
      if (method === failOn) return Promise.reject(new Error(`${method} failed`));
      if (method === "get_policy") return Promise.resolve(policy);
      if (method === "get_last_proposal_id") return Promise.resolve(proposals.length);
      const { from_index, limit } = args as { from_index: number; limit: number };
      return Promise.resolve(proposals.slice(from_index, from_index + limit));
    });
  }

  it("finds a pending proposal older than the newest 25", async () => {
    stubDao(
      Array.from({ length: 60 }, (_, id) =>
        proposalRecord({
          id,
          status: id === 5 ? "InProgress" : "Approved",
          submission_time: (nowNs - hourNs * BigInt(60 - id)).toString(),
        }),
      ),
    );
    const open = await readOpenDaoProposals(dao);
    expect(open.map((proposal) => proposal.id)).toEqual([5]);
  });

  it("drops proposals past the proposal period", async () => {
    stubDao([
      proposalRecord({ id: 0, submission_time: (nowNs - 200n * hourNs).toString() }),
      proposalRecord({ id: 1, submission_time: (nowNs - hourNs).toString() }),
    ]);
    expect((await readOpenDaoProposals(dao)).map((proposal) => proposal.id)).toEqual([1]);
  });

  it.each([
    "get_policy",
    "get_last_proposal_id",
    "get_proposals",
  ])("fails instead of reporting no pending proposals when %s fails", async (method) => {
    stubDao([proposalRecord({ id: 0, submission_time: nowNs.toString() })], method);
    await expect(readOpenDaoProposals(dao)).rejects.toThrow(`${method} failed`);
  });
});

describe("readDaoProposalPage", () => {
  const dao = "example.sputnik-dao.near";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubDao(last: number, removed: number[] = []) {
    return vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method, args) => {
      if (method === "get_last_proposal_id") return Promise.resolve(last);
      const { from_index, limit } = args as { from_index: number; limit: number };
      const ids = Array.from({ length: limit }, (_, offset) => from_index + offset).filter(
        (id) => id < last && !removed.includes(id),
      );
      return Promise.resolve(ids.map((id) => proposalRecord({ id })));
    });
  }

  it("reads the newest page first and pages backwards by ID", async () => {
    const view = stubDao(45);

    const first = await readDaoProposalPage(dao, { pageSize: 20 });
    expect(first.proposals.map((proposal) => proposal.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => 44 - i),
    );
    expect(first.nextBefore).toBe(25);

    const second = await readDaoProposalPage(dao, { before: 25, pageSize: 20 });
    expect(second.proposals.map((proposal) => proposal.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => 24 - i),
    );
    expect(second.nextBefore).toBe(5);

    const last = await readDaoProposalPage(dao, { before: 5, pageSize: 20 });
    expect(last.proposals.map((proposal) => proposal.id)).toEqual([4, 3, 2, 1, 0]);
    expect(last.nextBefore).toBeNull();
    expect(view.mock.calls.filter(([, method]) => method === "get_last_proposal_id")).toHaveLength(
      1,
    );
  });

  it("keeps page boundaries stable when proposals were removed", async () => {
    stubDao(10, [8, 6]);
    const page = await readDaoProposalPage(dao, { pageSize: 5 });
    expect(page.proposals.map((proposal) => proposal.id)).toEqual([9, 7, 5]);
    expect(page.nextBefore).toBe(5);
  });

  it("skips ranges whose proposals were all removed", async () => {
    stubDao(
      30,
      Array.from({ length: 12 }, (_, i) => 29 - i),
    );
    const page = await readDaoProposalPage(dao, { pageSize: 5 });
    expect(page.proposals.map((proposal) => proposal.id)).toEqual([17, 16, 15]);
    expect(page.nextBefore).toBe(15);
  });

  it("stops after a few empty ranges and still points at older proposals", async () => {
    const view = stubDao(
      40,
      Array.from({ length: 30 }, (_, i) => 39 - i),
    );
    const page = await readDaoProposalPage(dao, { pageSize: 5 });
    expect(page).toEqual({ proposals: [], nextBefore: 15 });
    expect(view.mock.calls.filter(([, method]) => method === "get_proposals")).toHaveLength(5);

    const older = await readDaoProposalPage(dao, { before: 15, pageSize: 5 });
    expect(older.proposals.map((proposal) => proposal.id)).toEqual([9, 8, 7, 6, 5]);
  });

  it("returns an empty page for a DAO without proposals", async () => {
    stubDao(0);
    expect(await readDaoProposalPage(dao)).toEqual({ proposals: [], nextBefore: null });
  });

  it("throws when the DAO can't be read, instead of returning an empty list", async () => {
    vi.spyOn(Near.prototype, "view").mockRejectedValue(new Error("RPC unavailable"));
    await expect(readDaoProposalPage(dao)).rejects.toThrow("RPC unavailable");
  });
});

describe("readDaoProposal", () => {
  const dao = "example.sputnik-dao.near";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a proposal by ID, including ones older than the first page", async () => {
    const view = vi
      .spyOn(Near.prototype, "view")
      .mockResolvedValue(proposalRecord({ id: 3, proposer: "member.near" }));
    expect(await readDaoProposal(dao, 3)).toMatchObject({ id: 3, proposer: "member.near" });
    expect(view).toHaveBeenCalledWith(dao, "get_proposal", { id: 3 });
  });

  it("returns null for a missing or removed proposal", async () => {
    vi.spyOn(Near.prototype, "view").mockRejectedValue(
      new Error(
        'Contract call failed: example.sputnik-dao.near.get_proposal - wasm execution failed with error: HostError(GuestPanic { panic_msg: "panicked at sputnikdao2/src/views.rs:100:48:\\nERR_NO_PROPOSAL" })',
      ),
    );
    expect(await readDaoProposal(dao, 999)).toBeNull();
  });

  it("throws on any other failure", async () => {
    vi.spyOn(Near.prototype, "view").mockRejectedValue(new Error("RPC unavailable"));
    await expect(readDaoProposal(dao, 1)).rejects.toThrow("RPC unavailable");
  });
});

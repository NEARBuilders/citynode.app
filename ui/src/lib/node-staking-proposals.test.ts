import { describe, expect, it } from "vitest";
import {
  buildNodeSequence,
  buildVotePlan,
  DELEGATE_DEPOSIT,
  EMPTY_CHAIN,
  FULL_DELEGATION_BPS,
  LOCKUP_DEPLOY_DEPOSIT,
  type NodeSequenceAction,
  type NodeSequenceChain,
  type NodeSequenceInputs,
  nodeSequenceBalances,
  pendingProposalFor,
  pendingVoteProposalFor,
  REGISTER_DEPOSIT,
  savedEndowmentOf,
  VENEAR_ACCOUNT,
  VOTING_ACCOUNT,
  withEndowment,
} from "./node-staking-proposals";
import type { SputnikProposal } from "./sputnik-proposals";

const NEAR = 10n ** 24n;

const inputs: NodeSequenceInputs = {
  team: "riverton.sputnik-dao.near",
  endowment: "endowment-fixture.sputnik-dao.near",
  pool: "riverton.poolv1.near",
  teamStakeYocto: NEAR,
  endowmentFundYocto: 50n * NEAR,
  endowmentStakeYocto: 40n * NEAR,
};

const chain: NodeSequenceChain = {
  ...EMPTY_CHAIN,
  teamLockup: "team-lockup.venear.dao",
  endowmentLockup: "endowment-lockup.venear.dao",
};

function action(actions: NodeSequenceAction[], id: NodeSequenceAction["id"]) {
  const found = actions.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function step(actions: NodeSequenceAction[], id: string) {
  const found = actions.flatMap((entry) => entry.steps).find((entry) => entry.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("buildNodeSequence", () => {
  it("lists the admin actions in order with their treasury", () => {
    const actions = buildNodeSequence(inputs, chain);
    expect(actions.map((entry) => [entry.id, entry.treasury])).toEqual([
      ["team-stake", "team"],
      ["team-house-of-stake", "team"],
      ["endowment-stake", "endowment"],
      ["endowment-delegate", "endowment"],
      ["team-vote", "team"],
      ["team-unwind", "team"],
      ["endowment-unwind", "endowment"],
    ]);
  });

  it("stakes the team treasury with its own pool", () => {
    expect(step(buildNodeSequence(inputs, chain), "stake").plan).toEqual({
      kind: "call",
      receiverId: "riverton.poolv1.near",
      methodName: "deposit_and_stake",
      args: {},
      gas: "200 Tgas",
      attachedDeposit: NEAR.toString(),
    });
  });

  it("registers the team with House of Stake, deploys its lockup and locks NEAR", () => {
    const steps = action(buildNodeSequence(inputs, chain), "team-house-of-stake").steps;
    expect(steps.map((entry) => entry.id)).toEqual(["register", "deploy-lockup", "lock"]);
    expect(steps[0]?.plan).toMatchObject({
      receiverId: VENEAR_ACCOUNT,
      methodName: "storage_deposit",
      attachedDeposit: REGISTER_DEPOSIT,
    });
    expect(steps[1]?.plan).toMatchObject({
      receiverId: VENEAR_ACCOUNT,
      methodName: "deploy_lockup",
      attachedDeposit: LOCKUP_DEPLOY_DEPOSIT,
    });
    expect(steps[2]?.plan).toMatchObject({
      receiverId: "team-lockup.venear.dao",
      methodName: "lock_near",
    });
  });

  it("funds, locks and stakes the endowment lockup with the team's pool", () => {
    const steps = action(buildNodeSequence(inputs, chain), "endowment-stake").steps;
    expect(steps.map((entry) => entry.id)).toEqual([
      "register-endowment",
      "deploy-lockup-endowment",
      "fund-lockup",
      "lock-endowment",
      "select-pool",
      "stake-endowment",
    ]);
    expect(
      step([action(buildNodeSequence(inputs, chain), "endowment-stake")], "fund-lockup").plan,
    ).toEqual({
      kind: "transfer",
      receiverId: "endowment-lockup.venear.dao",
      amountYocto: (50n * NEAR).toString(),
    });
    expect(steps[4]?.plan).toMatchObject({
      methodName: "select_staking_pool",
      args: { staking_pool_account_id: "riverton.poolv1.near" },
    });
    expect(steps[5]?.plan).toMatchObject({
      methodName: "deposit_and_stake",
      args: { amount: (40n * NEAR).toString() },
    });
  });

  it("releases a different pool before selecting the team's", () => {
    const steps = action(
      buildNodeSequence(inputs, {
        ...chain,
        endowmentLockupState: {
          liquid: "0",
          locked: "0",
          stakingPool: "other.poolv1.near",
          knownDeposited: "0",
        },
      }),
      "endowment-stake",
    ).steps;
    expect(steps.map((entry) => entry.id).slice(4)).toEqual([
      "unselect-old-pool",
      "select-pool",
      "stake-endowment",
    ]);
  });

  it("delegates the endowment's full veNEAR to the team treasury", () => {
    expect(step(buildNodeSequence(inputs, chain), "set-delegations").plan).toEqual({
      kind: "call",
      receiverId: VENEAR_ACCOUNT,
      methodName: "set_delegations",
      args: { entries: [{ account_id: "riverton.sputnik-dao.near", bps: FULL_DELEGATION_BPS }] },
      gas: "100 Tgas",
      attachedDeposit: DELEGATE_DEPOSIT,
    });
  });

  it("leaves a step without a plan until its amount or lockup is known", () => {
    const actions = buildNodeSequence(
      { ...inputs, teamStakeYocto: null, endowmentFundYocto: null },
      EMPTY_CHAIN,
    );
    expect(step(actions, "stake").plan).toBeNull();
    expect(step(actions, "fund-lockup").plan).toBeNull();
    expect(step(actions, "lock").plan).toBeNull();
  });

  it("marks one-time steps done from chain state and keeps stake steps repeatable", () => {
    const actions = buildNodeSequence(inputs, {
      ...chain,
      teamPool: { staked: NEAR, unstaked: 0n, canWithdraw: false },
      teamVenear: {
        account: { account_id: inputs.team, delegations: [] },
        internal: { lockup_version: 1 },
      },
      teamLockupState: {
        liquid: "0",
        locked: NEAR.toString(),
        stakingPool: null,
        knownDeposited: "0",
      },
      endowmentVenear: {
        account: {
          account_id: inputs.endowment,
          delegations: [{ account_id: inputs.team, bps: FULL_DELEGATION_BPS }],
        },
        internal: { lockup_version: null },
      },
      teamVote: "For",
    });
    expect(step(actions, "stake").done).toBe(false);
    expect(step(actions, "stake").blocker).toBeNull();
    expect(action(actions, "team-house-of-stake").steps.every((entry) => entry.done)).toBe(true);
    expect(step(actions, "register-endowment").done).toBe(true);
    expect(step(actions, "deploy-lockup-endowment").done).toBe(false);
    expect(step(actions, "set-delegations").done).toBe(true);
    expect(step(actions, "vote-for").done).toBe(true);
    expect(step(actions, "vote-against").done).toBe(false);
    expect(step(actions, "vote-abstain").done).toBe(false);
  });

  it("does not count a partial delegation as done", () => {
    const actions = buildNodeSequence(inputs, {
      ...chain,
      endowmentVenear: {
        account: {
          account_id: inputs.endowment,
          delegations: [{ account_id: inputs.team, bps: 5_000 }],
        },
        internal: { lockup_version: null },
      },
    });
    expect(step(actions, "set-delegations").done).toBe(false);
  });
});

describe("buildVotePlan", () => {
  it("votes through vote.dao with the team's proof and storage fee", () => {
    expect(
      buildVotePlan({ proposalId: 7, option: "For", proof: ["proof", "account"], storageFee: "5" }),
    ).toEqual({
      kind: "call",
      receiverId: VOTING_ACCOUNT,
      methodName: "vote",
      args: { proposal_id: 7, vote: "For", merkle_proof: "proof", v_account: "account" },
      gas: "300 Tgas",
      attachedDeposit: "5",
    });
  });
});

describe("pendingProposalFor", () => {
  const proposal = (status: string): SputnikProposal => ({
    id: 12,
    proposer: "admin-fixture.near",
    description: "",
    kind: {
      FunctionCall: {
        receiver_id: VENEAR_ACCOUNT,
        actions: [{ method_name: "storage_deposit", args: "", deposit: "0", gas: "0" }],
      },
    },
    status,
    vote_counts: {},
    votes: {},
    submission_time: "0",
  });

  it("finds the pending proposal that carries out a step", () => {
    const plan = step(buildNodeSequence(inputs, chain), "register").plan;
    expect(pendingProposalFor([proposal("InProgress")], plan)?.id).toBe(12);
    expect(pendingProposalFor([proposal("Approved")], plan)).toBeNull();
    expect(pendingProposalFor([proposal("InProgress")], null)).toBeNull();
  });

  it("matches a pending team vote proposal by proposal id and option", () => {
    const vote = (proposalId: number, option: string): SputnikProposal => ({
      ...proposal("InProgress"),
      kind: {
        FunctionCall: {
          receiver_id: VOTING_ACCOUNT,
          actions: [
            {
              method_name: "vote",
              args: btoa(JSON.stringify({ proposal_id: proposalId, vote: option })),
              deposit: "0",
              gas: "0",
            },
          ],
        },
      },
    });
    const forVote = vote(7, "For");
    expect(pendingVoteProposalFor([forVote], 7, "For")?.id).toBe(12);
    expect(pendingVoteProposalFor([forVote], 7, "Against")).toBeNull();
    expect(pendingVoteProposalFor([forVote], 7, "Abstain")).toBeNull();
    expect(pendingVoteProposalFor([forVote], 8, "For")).toBeNull();
    expect(pendingVoteProposalFor([forVote], null, "For")).toBeNull();
    expect(pendingVoteProposalFor([{ ...forVote, status: "Approved" }], 7, "For")).toBeNull();
  });
});

describe("step prerequisites", () => {
  it("blocks House of Stake steps until the previous one has landed", () => {
    const actions = buildNodeSequence(inputs, chain);
    expect(step(actions, "register").blocker).toBeNull();
    expect(step(actions, "deploy-lockup").blocker).toBe("teamNotRegistered");
    expect(step(actions, "lock").blocker).toBe("teamNoLockup");
    expect(step(actions, "deploy-lockup-endowment").blocker).toBe("endowmentNotRegistered");
    expect(step(actions, "fund-lockup").blocker).toBe("endowmentNoLockup");
    expect(step(actions, "lock-endowment").blocker).toBe("endowmentNoLockup");
    expect(step(actions, "stake-endowment").blocker).toBe("endowmentPoolNotSelected");
  });

  it("requires a locked and staked endowment before delegating", () => {
    const registered = {
      account: { account_id: inputs.team, delegations: [] },
      internal: { lockup_version: 1 },
    };
    const locked = {
      liquid: "0",
      locked: NEAR.toString(),
      stakingPool: inputs.pool,
      knownDeposited: "0",
    };
    expect(
      step(buildNodeSequence(inputs, { ...chain, teamVenear: registered }), "set-delegations")
        .blocker,
    ).toBe("endowmentNotLocked");
    expect(
      step(
        buildNodeSequence(inputs, {
          ...chain,
          teamVenear: registered,
          endowmentLockupState: locked,
        }),
        "set-delegations",
      ).blocker,
    ).toBe("endowmentNotStaked");
    expect(
      step(
        buildNodeSequence(inputs, {
          ...chain,
          teamVenear: registered,
          endowmentLockupState: { ...locked, knownDeposited: NEAR.toString() },
        }),
        "set-delegations",
      ).blocker,
    ).toBeNull();
  });

  it("lets the team vote only with veNEAR", () => {
    const idle = buildNodeSequence(inputs, chain);
    for (const id of ["vote-for", "vote-against", "vote-abstain"] as const) {
      expect(step(idle, id).blocker).toBe("teamNoVotingPower");
    }
    const withPower = buildNodeSequence(inputs, {
      ...chain,
      teamVenear: {
        account: {
          account_id: inputs.team,
          delegations: [],
          delegated_balance: { near_balance: NEAR.toString(), extra_venear_balance: "0" },
        },
        internal: { lockup_version: null },
      },
    });
    for (const id of ["vote-for", "vote-against", "vote-abstain"] as const) {
      expect(step(withPower, id).blocker).toBeNull();
    }
  });
});

describe("unwind steps", () => {
  it("only unstakes what is staked and withdraws once unlocked", () => {
    const idle = buildNodeSequence(inputs, chain);
    expect(step(idle, "unstake-team").blocker).toBe("teamNotStaked");
    expect(step(idle, "withdraw-team").blocker).toBe("teamNothingUnstaked");
    const waiting = buildNodeSequence(inputs, {
      ...chain,
      teamPool: { staked: NEAR, unstaked: NEAR, canWithdraw: false },
    });
    expect(step(waiting, "unstake-team").blocker).toBeNull();
    expect(step(waiting, "unstake-team").plan).toMatchObject({
      receiverId: inputs.pool,
      methodName: "unstake_all",
    });
    expect(step(waiting, "withdraw-team").blocker).toBe("teamWithdrawWait");
    const ready = buildNodeSequence(inputs, {
      ...chain,
      teamPool: { staked: 0n, unstaked: NEAR, canWithdraw: true },
    });
    expect(step(ready, "withdraw-team").blocker).toBeNull();
  });

  it("releases the endowment pool only once it is empty and clears delegations", () => {
    const state = {
      liquid: "0",
      locked: NEAR.toString(),
      stakingPool: inputs.pool,
      knownDeposited: NEAR.toString(),
    };
    const staked = buildNodeSequence(inputs, {
      ...chain,
      endowmentLockupState: state,
      endowmentPool: { staked: NEAR, unstaked: 0n, canWithdraw: false },
      endowmentVenear: {
        account: {
          account_id: inputs.endowment,
          delegations: [{ account_id: inputs.team, bps: FULL_DELEGATION_BPS }],
        },
        internal: { lockup_version: 1 },
      },
    });
    expect(step(staked, "unstake-endowment").blocker).toBeNull();
    expect(step(staked, "release-pool").blocker).toBe("endowmentPoolInUse");
    expect(step(staked, "clear-delegations").blocker).toBeNull();
    expect(step(staked, "clear-delegations").plan).toMatchObject({
      methodName: "set_delegations",
      args: { entries: [] },
    });
    const empty = buildNodeSequence(inputs, {
      ...chain,
      endowmentLockupState: { ...state, knownDeposited: "0" },
      endowmentPool: { staked: 0n, unstaked: 0n, canWithdraw: true },
    });
    expect(step(empty, "release-pool").blocker).toBeNull();
    expect(step(empty, "clear-delegations").blocker).toBe("endowmentNoDelegations");
  });
});

describe("nodeSequenceBalances", () => {
  it("sums lockup, stake and voting power", () => {
    expect(
      nodeSequenceBalances({
        ...chain,
        teamPool: { staked: 3n, unstaked: 1n, canWithdraw: false },
        endowmentLockupState: { liquid: "2", locked: "5", stakingPool: null, knownDeposited: "0" },
        endowmentPool: { staked: 4n, unstaked: 0n, canWithdraw: false },
        teamVenear: {
          account: {
            account_id: inputs.team,
            delegations: [],
            balance: { near_balance: "6", extra_venear_balance: "0" },
            delegated_balance: { near_balance: "7", extra_venear_balance: "0" },
          },
          internal: { lockup_version: 1 },
        },
      }),
    ).toMatchObject({
      teamStaked: 3n,
      teamUnstaked: 1n,
      teamVotingPower: 13n,
      endowmentInLockup: 7n,
      endowmentStaked: 4n,
    });
  });
});

describe("endowment metadata", () => {
  it("reads and writes the endowment without touching other keys", () => {
    expect(savedEndowmentOf({ endowmentAccountId: "nf-fixture.sputnik-dao.near" })).toBe(
      "nf-fixture.sputnik-dao.near",
    );
    expect(savedEndowmentOf({ endowmentAccountId: 3 })).toBe("");
    expect(withEndowment({ poolAccountId: "p.near" }, "nf-fixture.sputnik-dao.near")).toEqual({
      poolAccountId: "p.near",
      endowmentAccountId: "nf-fixture.sputnik-dao.near",
    });
    expect(withEndowment({ poolAccountId: "p.near", endowmentAccountId: "x" }, "")).toEqual({
      poolAccountId: "p.near",
    });
  });
});

describe("delegation proposal matching", () => {
  const delegationProposal = (entries: unknown[]): SputnikProposal => ({
    id: 30,
    proposer: "admin-fixture.near",
    description: "",
    kind: {
      FunctionCall: {
        receiver_id: VENEAR_ACCOUNT,
        actions: [
          {
            method_name: "set_delegations",
            args: btoa(JSON.stringify({ entries })),
            deposit: "0",
            gas: "0",
          },
        ],
      },
    },
    status: "InProgress",
    vote_counts: {},
    votes: {},
    submission_time: "0",
  });

  it("keeps delegate and clear proposals apart", () => {
    const actions = buildNodeSequence(inputs, chain);
    const delegate = delegationProposal([{ account_id: inputs.team, bps: FULL_DELEGATION_BPS }]);
    const clear = delegationProposal([]);
    expect(pendingProposalFor([delegate], step(actions, "set-delegations").plan)?.id).toBe(30);
    expect(pendingProposalFor([delegate], step(actions, "clear-delegations").plan)).toBeNull();
    expect(pendingProposalFor([clear], step(actions, "clear-delegations").plan)?.id).toBe(30);
    expect(pendingProposalFor([clear], step(actions, "set-delegations").plan)).toBeNull();
  });
});

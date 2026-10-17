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
  pendingProposalFor,
  REGISTER_DEPOSIT,
  VENEAR_ACCOUNT,
  VOTING_ACCOUNT,
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
  it("lists the five admin actions in order with their treasury", () => {
    const actions = buildNodeSequence(inputs, chain);
    expect(actions.map((entry) => [entry.id, entry.treasury])).toEqual([
      ["team-stake", "team"],
      ["team-house-of-stake", "team"],
      ["endowment-stake", "endowment"],
      ["endowment-delegate", "endowment"],
      ["team-vote", "team"],
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

  it("marks steps done from chain state", () => {
    const actions = buildNodeSequence(inputs, {
      ...chain,
      teamStakedYocto: NEAR,
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
      teamVoted: true,
    });
    expect(action(actions, "team-stake").steps.every((entry) => entry.done)).toBe(true);
    expect(action(actions, "team-house-of-stake").steps.every((entry) => entry.done)).toBe(true);
    expect(step(actions, "register-endowment").done).toBe(true);
    expect(step(actions, "deploy-lockup-endowment").done).toBe(false);
    expect(step(actions, "set-delegations").done).toBe(true);
    expect(step(actions, "vote").done).toBe(true);
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
});

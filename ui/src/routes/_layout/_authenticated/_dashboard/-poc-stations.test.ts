import { describe, expect, it } from "vitest";
import type { SputnikProposal } from "./-poc-chain";
import {
  buildStations,
  type ChainFacts,
  deriveStations,
  isSharedTreasurySkip,
  pendingProposalCount,
  runnableRun,
  type StationInputs,
} from "./-poc-stations";

const ENDOWMENT = "endowment.sputnik-dao.near";
const TEAM = "team.sputnik-dao.near";
const LOCKUP = "endowment.lockup.venear.dao";

const inputs: StationInputs = {
  slug: "thing",
  pool: "thing.pool.near",
  endowmentAccount: ENDOWMENT,
  teamAccount: TEAM,
  endowmentLockup: LOCKUP,
  lockYocto: 10n ** 24n,
  stakeYocto: 10n ** 24n,
  delegateBps: 10_000,
  govProposalId: 3,
};

const noFacts: ChainFacts = {
  tenantDeployed: false,
  applicationProposed: false,
  configPublished: false,
  applicationApplied: false,
  endowmentRegistered: false,
  lockupDeployed: false,
  lockupFunded: false,
  nearLocked: false,
  poolSelected: false,
  stakedFromLockup: false,
  teamStaked: false,
  teamRegistered: false,
  delegated: false,
  voteCast: false,
  unstaked: false,
  withdrawn: false,
  poolReleased: false,
  delegationsCleared: false,
  teamUnstaked: false,
  teamWithdrawn: false,
  treasuriesShared: false,
};

const accounts = { session: "work.efiz.near", endowment: ENDOWMENT, team: TEAM };

function derive(overrides: Partial<Parameters<typeof deriveStations>[0]> = {}) {
  return deriveStations({
    stations: buildStations(inputs),
    facts: noFacts,
    proposalsBySigner: {},
    accounts,
    connectedDao: null,
    ...overrides,
  });
}

function proposal(
  id: number,
  receiverId: string,
  methodName: string,
  status = "InProgress",
): SputnikProposal {
  return {
    id,
    proposer: "sponsor.trezu.near",
    description: "",
    kind: {
      FunctionCall: {
        receiver_id: receiverId,
        actions: [{ method_name: methodName, args: "", deposit: "0", gas: "0" }],
      },
    },
    status,
    vote_counts: { Approver: ["0", "0", "0"] },
    votes: {},
    submission_time: "0",
  };
}

describe("buildStations", () => {
  it("orders twelve stations across four phases", () => {
    const stations = buildStations(inputs);
    expect(stations.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(stations.map((s) => s.phase)).toEqual([
      "stand-up",
      "stand-up",
      "stand-up",
      "fund",
      "fund",
      "fund",
      "vote",
      "vote",
      "vote",
      "refresh",
      "refresh",
      "refresh",
    ]);
  });

  it("assigns exactly one signer per station", () => {
    const byId = Object.fromEntries(buildStations(inputs).map((s) => [s.id, s.signer]));
    expect(byId).toEqual({
      apply: "session",
      approve: "session",
      publish: "team",
      endow: "endowment",
      stake: "endowment",
      "stake-team": "team",
      "register-team": "team",
      delegate: "endowment",
      vote: "team",
      unstake: "endowment",
      undelegate: "endowment",
      "unstake-team": "team",
    });
  });

  it("stakes the team's own NEAR directly into the pool", () => {
    const stakeTeam = buildStations(inputs).find((s) => s.id === "stake-team");
    expect(stakeTeam?.steps[0]?.plan).toEqual({
      kind: "call",
      receiverId: "thing.pool.near",
      methodName: "deposit_and_stake",
      args: {},
      gas: "200 Tgas",
      attachedDeposit: (10n ** 24n).toString(),
    });
  });

  it("unwinds the team's direct stake back to its treasury", () => {
    const unstakeTeam = buildStations(inputs).find((s) => s.id === "unstake-team");
    expect(
      unstakeTeam?.steps.map((s) => (s.plan?.kind === "call" ? s.plan.methodName : null)),
    ).toEqual(["unstake_all", "withdraw"]);
    expect(unstakeTeam?.steps.every((s) => s.plan?.receiverId === "thing.pool.near")).toBe(true);
  });

  it("unwinds the stake and delegation so the cycle can refresh", () => {
    const byId = Object.fromEntries(buildStations(inputs).map((s) => [s.id, s]));
    const unstake = byId.unstake;
    expect(unstake?.steps.map((s) => (s.plan?.kind === "call" ? s.plan.methodName : null))).toEqual(
      ["unstake_all", "withdraw_all_from_staking_pool", "unselect_staking_pool"],
    );
    expect(unstake?.steps.every((s) => s.plan?.receiverId === LOCKUP)).toBe(true);
    const undelegate = byId.undelegate;
    expect(undelegate?.steps[0]?.plan).toMatchObject({
      kind: "call",
      receiverId: "venear.dao",
      methodName: "set_delegations",
      args: { entries: [] },
    });
  });

  it("targets the delegation at the team wallet, not the session wallet", () => {
    const delegate = buildStations(inputs).find((s) => s.id === "delegate");
    const plan = delegate?.steps[0]?.plan;
    expect(plan).toMatchObject({
      kind: "call",
      receiverId: "venear.dao",
      methodName: "set_delegations",
      args: { entries: [{ account_id: TEAM, bps: 10_000 }] },
    });
  });

  it("funds the lockup with the lock plus stake amount", () => {
    const endow = buildStations(inputs).find((s) => s.id === "endow");
    expect(endow?.steps.find((s) => s.id === "fund-lockup")?.plan).toEqual({
      kind: "transfer",
      receiverId: LOCKUP,
      amountYocto: (2n * 10n ** 24n).toString(),
    });
  });

  it("falls back to the team wallet when no endowment account is set", () => {
    const stations = buildStations({ ...inputs, endowmentAccount: "" });
    expect(stations.find((s) => s.id === "endow")?.signer).toBe("team");
  });
});

describe("deriveStations", () => {
  it("makes only the first station ready and blocks everything downstream", () => {
    const states = derive();
    expect(states[0].status).toBe("ready");
    expect(states.slice(1).every((s) => s.status === "blocked")).toBe(true);
    expect(states[1].blockedReason).toBe("waiting on an earlier station");
  });

  it("advances to the next station once upstream facts are satisfied", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true },
    });
    expect(states[0].status).toBe("done");
    expect(states[1].status).toBe("ready");
    expect(states[2].status).toBe("blocked");
  });

  it("reports a station as staged when a pending DAO proposal matches its plan", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true, tenantDeployed: true },
      proposalsBySigner: { team: [proposal(7, "registry.near", "__fastdata_kv")] },
      connectedDao: TEAM,
    });
    const publish = states[2];
    expect(publish.status).toBe("staged");
    expect(publish.steps.find((s) => s.id === "publish")?.pendingProposal?.id).toBe(7);
    expect(pendingProposalCount(states)).toBe(1);
  });

  it("ignores proposals that are no longer in progress", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true, tenantDeployed: true },
      proposalsBySigner: { team: [proposal(7, "registry.near", "__fastdata_kv", "Approved")] },
      connectedDao: TEAM,
    });
    expect(states[2].status).toBe("ready");
  });

  it("does not attribute one treasury's proposals to another", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true, tenantDeployed: true },
      proposalsBySigner: { endowment: [proposal(7, "registry.near", "__fastdata_kv")] },
      connectedDao: TEAM,
    });
    expect(states[2].status).toBe("ready");
  });

  it("skips the delegate stations when both treasuries are one account", () => {
    const facts = { ...noFacts, treasuriesShared: true, applicationProposed: true };
    const states = derive({ facts });
    const registerTeam = states.find((s) => s.def.id === "register-team");
    const delegate = states.find((s) => s.def.id === "delegate");
    expect(registerTeam?.status).toBe("skipped");
    expect(delegate?.status).toBe("skipped");
    expect(registerTeam?.skipReason).toBe(
      "team and endowment are one account — the shared wallet registers in Lock the sponsor's NEAR",
    );
    expect(delegate?.skipReason).toBe("the endowment cannot delegate to itself");
    expect(states.find((s) => s.def.id === "stake-team")?.skipReason).toBeNull();
    expect(isSharedTreasurySkip("vote", facts)).toBe(false);
  });

  it("treats skipped stations as satisfied for downstream ordering", () => {
    const states = derive({
      facts: {
        ...noFacts,
        treasuriesShared: true,
        applicationProposed: true,
        configPublished: true,
        applicationApplied: true,
        tenantDeployed: true,
        endowmentRegistered: true,
        lockupDeployed: true,
        lockupFunded: true,
        nearLocked: true,
        poolSelected: true,
        stakedFromLockup: true,
        teamStaked: true,
      },
    });
    expect(states.find((s) => s.def.id === "vote")?.status).toBe("ready");
  });

  it("keeps a station awaiting votes while its proposal is open, even if the fact is satisfied", () => {
    const states = derive({
      facts: {
        ...noFacts,
        ...deployDone,
        endowmentRegistered: true,
        lockupDeployed: true,
        lockupFunded: true,
        nearLocked: true,
        poolSelected: true,
        stakedFromLockup: true,
      },
      proposalsBySigner: {
        endowment: [
          proposal(5, LOCKUP, "select_staking_pool"),
          proposal(6, LOCKUP, "deposit_and_stake"),
        ],
      },
      connectedDao: ENDOWMENT,
    });
    const stake = states.find((s) => s.def.id === "stake");
    expect(stake?.steps.find((s) => s.id === "select-pool")?.status).toBe("staged");
    expect(stake?.steps.find((s) => s.id === "stake")?.status).toBe("staged");
    expect(stake?.status).toBe("staged");
    expect(stake?.canRun).toBe(false);
    expect(stake?.runBlockReason).toBe("awaiting votes");
  });

  it("surfaces input blockers ahead of ordering blockers", () => {
    const states = derive({ blockers: { apply: "select an organization first" } });
    expect(states[0].status).toBe("blocked");
    expect(states[0].blockedReason).toBe("select an organization first");
  });

  it("marks a station failed and stops the run there", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true },
      failedStations: { publish: "insufficient balance" },
      connectedDao: TEAM,
    });
    expect(states[2].status).toBe("failed");
    expect(states[2].blockedReason).toBe("insufficient balance");
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["approve"]);
  });

  it("tracks whether the required signer is the connected treasury", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true },
      connectedDao: ENDOWMENT,
    });
    expect(states.find((s) => s.def.id === "publish")?.signerConnected).toBe(false);
    expect(states.find((s) => s.def.id === "endow")?.signerConnected).toBe(true);
    expect(states.find((s) => s.def.id === "apply")?.signerConnected).toBe(true);
  });
});

const deployDone = {
  applicationProposed: true,
  configPublished: true,
  applicationApplied: true,
  tenantDeployed: true,
};

describe("runnableRun", () => {
  it("stops at the first station the connected wallet cannot sign", () => {
    const states = derive({ facts: { ...noFacts } });
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["apply", "approve"]);
  });

  it("never crosses a signer boundary", () => {
    const states = derive({
      facts: { ...noFacts, ...deployDone },
      connectedDao: ENDOWMENT,
    });
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["endow", "stake"]);
  });

  it("runs the session stations before stopping at an unconnected treasury", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true },
      connectedDao: ENDOWMENT,
    });
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["approve"]);
  });

  it("walks through stations blocked only by upstream ordering", () => {
    const states = derive({
      facts: { ...noFacts, ...deployDone },
      connectedDao: ENDOWMENT,
    });
    expect(states.find((s) => s.def.id === "stake")?.blockedBy).toBe("upstream");
    expect(runnableRun(states).map((s) => s.def.id)).toContain("stake");
  });

  it("stops dead at a station blocked by a bad input", () => {
    const states = derive({
      facts: { ...noFacts, ...deployDone },
      blockers: { stake: "enter a stake amount" },
      connectedDao: ENDOWMENT,
    });
    expect(states.find((s) => s.def.id === "stake")?.blockedBy).toBe("input");
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["endow"]);
  });

  it("walks past already-satisfied stations", () => {
    const states = derive({
      facts: {
        ...noFacts,
        ...deployDone,
        endowmentRegistered: true,
        lockupDeployed: true,
        lockupFunded: true,
        nearLocked: true,
      },
      connectedDao: ENDOWMENT,
    });
    expect(runnableRun(states).map((s) => s.def.id)).toEqual(["stake"]);
  });

  it("skips fully staged stations with nothing left to sign", () => {
    const states = derive({
      facts: {
        ...noFacts,
        ...deployDone,
        endowmentRegistered: true,
        lockupDeployed: true,
        lockupFunded: true,
        nearLocked: true,
      },
      proposalsBySigner: {
        endowment: [
          proposal(1, LOCKUP, "select_staking_pool"),
          proposal(2, LOCKUP, "deposit_and_stake"),
          proposal(3, "venear.dao", "set_delegations"),
        ],
      },
      connectedDao: ENDOWMENT,
    });
    expect(states.find((s) => s.def.id === "stake")?.status).toBe("staged");
    expect(states.find((s) => s.def.id === "delegate")?.status).toBe("staged");
    expect(runnableRun(states).map((s) => s.def.id)).toEqual([]);
  });
});

describe("run gating", () => {
  it("enables ready stations with pending work and a connected signer", () => {
    const states = derive({
      facts: {
        ...noFacts,
        ...deployDone,
        endowmentRegistered: true,
        lockupDeployed: true,
        lockupFunded: true,
        nearLocked: true,
      },
      connectedDao: ENDOWMENT,
    });
    const stake = states.find((s) => s.def.id === "stake");
    expect(stake?.canRun).toBe(true);
    expect(stake?.runBlockReason).toBeNull();
  });

  it("disables upstream-blocked stations with a reason", () => {
    const states = derive({ facts: { ...noFacts, applicationProposed: true } });
    const stake = states.find((s) => s.def.id === "stake");
    expect(stake?.canRun).toBe(false);
    expect(stake?.runBlockReason).toBe("waiting on an earlier station");
  });

  it("disables input-blocked stations with the blocker as the reason", () => {
    const states = derive({
      facts: { ...noFacts, applicationProposed: true },
      blockers: { approve: "admin access required — sign in as an admin" },
      connectedDao: TEAM,
    });
    const approve = states.find((s) => s.def.id === "approve");
    expect(approve?.canRun).toBe(false);
    expect(approve?.runBlockReason).toBe("admin access required — sign in as an admin");
  });

  it("reports awaiting votes when only staged steps remain", () => {
    const states = derive({
      facts: { ...noFacts, ...deployDone, endowmentRegistered: true, lockupDeployed: true },
      proposalsBySigner: {
        endowment: [
          proposal(1, LOCKUP, "select_staking_pool"),
          proposal(2, LOCKUP, "deposit_and_stake"),
          proposal(3, "venear.dao", "set_delegations"),
        ],
      },
      connectedDao: ENDOWMENT,
    });
    const stake = states.find((s) => s.def.id === "stake");
    expect(stake?.canRun).toBe(false);
    expect(stake?.runBlockReason).toBe("awaiting votes");
  });

  it("keeps failed stations retryable when the signer is connected", () => {
    const states = derive({
      facts: { ...noFacts, ...deployDone },
      failedStations: { endow: "lockup deployment reverted" },
      connectedDao: ENDOWMENT,
    });
    const endow = states.find((s) => s.def.id === "endow");
    expect(endow?.status).toBe("failed");
    expect(endow?.canRun).toBe(true);
  });
});

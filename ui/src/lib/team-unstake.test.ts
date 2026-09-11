import { describe, expect, it, vi } from "vitest";
import {
  parseUnstakeAmount,
  proposeTeamUnstake,
  teamUnstakeCall,
  yoctoToNearInput,
} from "./team-unstake";

const staked = 2_500_000_000_000_000_000_000_000n;

vi.mock("@/lib/dao-connect", () => ({
  verifyDaoAccount: vi.fn(),
  signAsDaoTransaction: vi.fn(),
  describeDaoError: (error: unknown, want: string) =>
    error instanceof Error ? `${error.message} (${want})` : `${String(error)} (${want})`,
}));

import { signAsDaoTransaction, verifyDaoAccount } from "@/lib/dao-connect";

describe("team unstake proposal", () => {
  it("builds a partial pool unstake signed by the team treasury", () => {
    expect(teamUnstakeCall("city-node-4.pool.near", staked)).toEqual({
      receiverId: "city-node-4.pool.near",
      methodName: "unstake",
      args: { amount: "2500000000000000000000000" },
      gas: "125 Tgas",
      attachedDeposit: "1",
    });
    expect(yoctoToNearInput(staked)).toBe("2.5");
    expect(parseUnstakeAmount("2.5", staked)).toBe(staked);
    expect(parseUnstakeAmount("3", staked)).toBeNull();
    expect(parseUnstakeAmount("0", staked)).toBeNull();
  });

  it("connects Trezu as the team treasury and proposes the unstake call", async () => {
    vi.mocked(verifyDaoAccount).mockResolvedValue(false);
    vi.mocked(signAsDaoTransaction).mockResolvedValue({} as never);
    const connection = {
      daoAccountId: "other.sputnik-dao.near",
      connect: vi.fn().mockResolvedValue("india.sputnik-dao.near"),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    await proposeTeamUnstake({
      teamAccountId: "india.sputnik-dao.near",
      poolAccountId: "city-node-4.pool.near",
      amountYocto: 1_000_000_000_000_000_000_000_000n,
      stakedBalance: staked,
      authAccountId: "itexpert120-contra.near",
      connection,
    });
    expect(connection.disconnect).toHaveBeenCalled();
    expect(connection.connect).toHaveBeenCalledWith({
      authAccountId: "itexpert120-contra.near",
    });
    expect(signAsDaoTransaction).toHaveBeenCalledWith(
      "india.sputnik-dao.near",
      teamUnstakeCall("city-node-4.pool.near", 1_000_000_000_000_000_000_000_000n),
    );
  });
});

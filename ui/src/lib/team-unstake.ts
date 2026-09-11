import {
  describeDaoError,
  signAsDaoTransaction,
  type UseDaoConnectionResult,
  verifyDaoAccount,
} from "@/lib/dao-connect";
import { parseNearAmount } from "@/lib/near-amount";

const YOCTO_PER_NEAR = 10n ** 24n;

export function teamUnstakeCall(poolAccountId: string, amountYocto: bigint) {
  return {
    receiverId: poolAccountId,
    methodName: "unstake",
    args: { amount: amountYocto.toString() },
    gas: "125 Tgas",
    attachedDeposit: "1",
  };
}

export function yoctoToNearInput(yocto: bigint) {
  const whole = yocto / YOCTO_PER_NEAR;
  const fraction = (yocto % YOCTO_PER_NEAR).toString().padStart(24, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function parseUnstakeAmount(amount: string, staked: bigint) {
  const yocto = parseNearAmount(amount);
  if (!yocto || yocto > staked) return null;
  return yocto;
}

export async function proposeTeamUnstake(input: {
  teamAccountId: string;
  poolAccountId: string;
  amountYocto: bigint;
  stakedBalance: bigint;
  authAccountId: string | null;
  connection: Pick<UseDaoConnectionResult, "daoAccountId" | "connect" | "disconnect">;
}) {
  if (input.amountYocto <= 0n || input.amountYocto > input.stakedBalance) {
    throw new Error("Enter an amount within the available team stake.");
  }
  try {
    let dao = input.connection.daoAccountId;
    if (dao !== input.teamAccountId || !(await verifyDaoAccount(input.teamAccountId))) {
      if (dao) await input.connection.disconnect();
      dao = await input.connection.connect({
        authAccountId: input.authAccountId ?? undefined,
      });
    }
    if (dao !== input.teamAccountId) {
      throw new Error(
        `Trezu connected ${dao}, but this unstake must be signed by ${input.teamAccountId}`,
      );
    }
    await signAsDaoTransaction(
      input.teamAccountId,
      teamUnstakeCall(input.poolAccountId, input.amountYocto),
    );
  } catch (error) {
    throw new Error(describeDaoError(error, input.teamAccountId));
  }
}

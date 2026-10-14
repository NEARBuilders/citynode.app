import { Data, Effect } from "effect";
import { AppActionError } from "@/i18n/error-message";
import {
  signAsDaoTransaction,
  type UseDaoConnectionResult,
  verifyDaoAccount,
} from "@/lib/dao-connect";
import { parseNearAmount } from "@/lib/near-amount";

const YOCTO_PER_NEAR = 10n ** 24n;

export interface PoolCall {
  receiverId: string;
  methodName: "unstake" | "withdraw";
  args: { amount: string };
  gas: string;
}

export function teamPoolCall(
  poolAccountId: string,
  methodName: "unstake" | "withdraw",
  amountYocto: bigint,
): PoolCall {
  return {
    receiverId: poolAccountId,
    methodName,
    args: { amount: amountYocto.toString() },
    gas: "125 Tgas",
  };
}

export function yoctoToNearInput(yocto: bigint) {
  const whole = yocto / YOCTO_PER_NEAR;
  const fraction = (yocto % YOCTO_PER_NEAR).toString().padStart(24, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function maxMinusOneNear(maxYocto: bigint): bigint {
  return maxYocto > YOCTO_PER_NEAR ? maxYocto - YOCTO_PER_NEAR : maxYocto;
}

export function parseUnstakeAmount(amount: string, max: bigint) {
  const yocto = parseNearAmount(amount);
  if (!yocto || yocto > max) return null;
  return yocto;
}

export class TeamPoolWalletFailed extends Data.TaggedError("TeamPoolWalletFailed")<{
  readonly cause: unknown;
}> {}

function walletStep<A>(run: () => Promise<A>) {
  return Effect.tryPromise({ try: run, catch: (cause) => new TeamPoolWalletFailed({ cause }) });
}

export const proposeTeamPoolAction = Effect.fn("proposeTeamPoolAction")(function* <E>(input: {
  teamAccountId: string;
  poolAccountId: string;
  method: "unstake" | "withdraw";
  amountYocto: bigint;
  maxAmountYocto: bigint;
  authAccountId: string | null;
  connection: Pick<UseDaoConnectionResult, "daoAccountId" | "connect" | "disconnect">;
  beforeSign: Effect.Effect<void, E>;
}) {
  if (input.amountYocto <= 0n || input.amountYocto > input.maxAmountYocto) {
    return yield* new AppActionError(
      input.method === "unstake" ? "stake.invalidTeamUnstake" : "stake.invalidTeamWithdraw",
    );
  }
  const dao = yield* Effect.interruptible(
    Effect.gen(function* () {
      const current = input.connection.daoAccountId;
      if (
        current === input.teamAccountId &&
        (yield* walletStep(() => verifyDaoAccount(input.teamAccountId)))
      ) {
        return current;
      }
      if (current) yield* walletStep(() => input.connection.disconnect());
      return yield* walletStep(() =>
        input.connection.connect({ authAccountId: input.authAccountId ?? undefined }),
      );
    }),
  );
  if (dao !== input.teamAccountId) {
    return yield* new AppActionError("wallet.daoWrongAccount", {
      actual: dao,
      expected: input.teamAccountId,
    });
  }
  yield* Effect.interruptible(input.beforeSign);
  yield* walletStep(() =>
    signAsDaoTransaction(
      input.teamAccountId,
      teamPoolCall(input.poolAccountId, input.method, input.amountYocto),
    ),
  );
}, Effect.uninterruptible);

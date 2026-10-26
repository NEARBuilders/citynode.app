import { Data, Effect } from "effect";
import { type NearNetworkId, viewFunction } from "./near-rpc";

export type StakingPoolWhitelists = Record<NearNetworkId, string>;

export class StakingPoolCheckFailed extends Data.TaggedError("StakingPoolCheckFailed")<{
  readonly network: NearNetworkId;
  readonly cause: unknown;
}> {
  override get message() {
    return `Could not check the staking pool whitelist on ${this.network}: ${
      this.cause instanceof Error ? this.cause.message : String(this.cause)
    }`;
  }
}

export class UnsupportedStakingNetwork extends Data.TaggedError("UnsupportedStakingNetwork")<{
  readonly network: string;
}> {
  override get message() {
    return `Staking is not supported on network "${this.network}"`;
  }
}

export interface StakingPoolsService {
  isApproved(
    accountId: string,
    network: string,
  ): Effect.Effect<boolean, StakingPoolCheckFailed | UnsupportedStakingNetwork>;
}

function isNearNetwork(network: string): network is NearNetworkId {
  return network === "mainnet" || network === "testnet";
}

export function makeStakingPools(whitelists: StakingPoolWhitelists): StakingPoolsService {
  return {
    isApproved: (accountId, network) =>
      Effect.gen(function* () {
        if (!isNearNetwork(network)) {
          return yield* Effect.fail(new UnsupportedStakingNetwork({ network }));
        }
        const approved = yield* Effect.tryPromise({
          try: () =>
            viewFunction<boolean>({
              accountId: whitelists[network],
              methodName: "is_whitelisted",
              args: { staking_pool_account_id: accountId },
              network,
            }),
          catch: (cause) => new StakingPoolCheckFailed({ network, cause }),
        });
        return approved === true;
      }),
  };
}

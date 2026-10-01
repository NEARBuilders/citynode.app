import type { RelayInput } from "@near-intents-agent-api/relayer/schema";
import { ApiError } from "../shared/errors.js";
import { optionalSlot } from "./slot.js";
import { withSponsorKey } from "./sponsor-pool.js";

/**
 * `beforeBroadcast` is mandatory: it runs after signing and before broadcast and is the final
 * dispatch fence and sponsor-budget commit. A relayer that resolves without invoking it is treated
 * as possibly broadcast.
 */
export type Relayer = (
  input: RelayInput,
  ownerPublicKey: string,
  beforeBroadcast: (transactionHash: string) => Promise<void>,
) => Promise<unknown>;

const slot = optionalSlot<Relayer>();

export function configureRelayer(next: Relayer | undefined) {
  slot.set(next);
}

/** Keep the final dispatch fence inside the sponsor lock and before broadcast. */
export function withSponsorLock(relayer: Relayer, sponsorAccountId: string): Relayer {
  return (input, ownerPublicKey, beforeBroadcast) =>
    withSponsorKey(sponsorAccountId, () => relayer(input, ownerPublicKey, beforeBroadcast));
}

/** Relay is opt-in: without a configured sponsor key the route has nothing to submit with. */
export function requireRelayer(): Relayer {
  const relayer = slot.get();
  if (!relayer) throw new ApiError("relay_disabled", 503);
  return relayer;
}

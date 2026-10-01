import type {
  createDeterministicWalletInitializer,
  createSignedWalletRelayer,
  createWalletPolicyFunder,
} from "@near-intents-agent-api/relayer";
import { ApiError } from "../shared/errors.js";
import { optionalSlot } from "./slot.js";

export type WalletSponsorClient = {
  accountId: string;
  initialize: ReturnType<typeof createDeterministicWalletInitializer>;
  relaySigned: ReturnType<typeof createSignedWalletRelayer>;
  fundPolicyStorage: ReturnType<typeof createWalletPolicyFunder>;
};

const slot = optionalSlot<WalletSponsorClient>();

export function configureWalletSponsor(next: WalletSponsorClient | undefined) {
  slot.set(next);
}

export function getWalletSponsor() {
  return slot.get();
}

/** A deployment without a sponsor key cannot fund or relay an owner wallet write. */
export function requireWalletSponsor(): WalletSponsorClient {
  const sponsor = slot.get();
  if (!sponsor) throw new ApiError("wallet_sponsor_disabled", 503);
  return sponsor;
}

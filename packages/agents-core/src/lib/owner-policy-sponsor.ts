import type { createOwnerPolicySponsor } from "@near-intents-agent-api/relayer";
import { ApiError } from "../shared/errors.js";
import { optionalSlot } from "./slot.js";

export type OwnerPolicySponsorClient = ReturnType<typeof createOwnerPolicySponsor>;

const slot = optionalSlot<OwnerPolicySponsorClient>();

export function configureOwnerPolicySponsor(next: OwnerPolicySponsorClient | undefined) {
  slot.set(next);
}

export function getOwnerPolicySponsor() {
  return slot.get();
}

/** A NEAR-owner policy write needs the sponsor key; the wallet sponsor cannot relay it. */
export function requireOwnerPolicySponsor(): OwnerPolicySponsorClient {
  const sponsor = slot.get();
  if (!sponsor) throw new ApiError("wallet_sponsor_disabled", 503);
  return sponsor;
}

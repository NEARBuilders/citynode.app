import {
  canonicalDestination,
  type ExecutionRequest,
  type GrantDestination,
} from "@near-intents-agent-api/contracts";
import { ApiError } from "../../shared/errors.js";

type GrantSpendBucket = { asset: string; amount: string };

/** Extract destinations for API access checks and value metadata for the containment inventory.
 * Spending policy is enforced by OutLayer, not by this module.
 */

/** One counted amount: the token bucket and the exact integer amount in that token. */
export type { GrantSpendBucket };

export type GrantCheck = {
  /** Decoded external destinations, including refunds. Every entry must be allowlisted. */
  recipients: GrantDestination[];
  audience?: string;
  /**
   * True when value stays with the wallet itself (swap, shield, a deposit without a refund
   * address), so an empty `recipients` is known rather than undecoded.
   */
  selfDirected: boolean;
  /** Observed value effects; not an API spending ceiling. */
  spend: GrantSpendBucket[];
  /**
   * True when one or more value effects are not represented by `spend`. OutLayer policy
   * determines whether the operation is permitted.
   */
  amountUnknown: boolean;
};

const nativeAsset = "native";

type Fields = Record<string, unknown>;

function stringField(source: Fields, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function amountOf(source: Fields, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && /^[0-9]{1,78}$/.test(value) ? value : undefined;
}

/** Recipients named by a plain `to`, plus the amount sent there. */
function destinationCheck(request: Fields, amountKey: string): GrantCheck {
  const amount = amountOf(request, amountKey);

  return {
    recipients: [],
    selfDirected: false,
    spend: amount ? [{ asset: stringField(request, "token") ?? nativeAsset, amount }] : [],
    // Intents routes settle through the provider gateway; the amount is reported, not bound.
    amountUnknown: true,
  };
}

/** Shield-style actions that name an amount but move it within the account itself. */
function selfDepositCheck(request: Fields): GrantCheck {
  const amount = amountOf(request, "amount");
  return {
    recipients: [],
    selfDirected: true,
    spend: amount ? [{ asset: stringField(request, "token") ?? nativeAsset, amount }] : [],
    amountUnknown: true,
  };
}

/** Deposit-intent style actions where a refund address receives value if the bridge fails. */
function refundableCheck(request: Fields): GrantCheck {
  const amount = amountOf(request, "amount");

  const asset =
    stringField(request, "token") ?? stringField(request, "source_asset") ?? nativeAsset;
  return {
    recipients: [],
    selfDirected: true,
    spend: amount ? [{ asset, amount }] : [],
    amountUnknown: true,
  };
}

function swapCheck(request: Fields): GrantCheck {
  const amount = amountOf(request, "amount_in");
  return {
    recipients: [],
    selfDirected: true,
    spend: amount ? [{ asset: stringField(request, "token_in") ?? nativeAsset, amount }] : [],
    // The input amount does not bound provider-selected route, output, or fees. Keep its known
    // input bucket for reporting; provider policy handles the remaining effects.
    amountUnknown: true,
  };
}

/** The extractor for one action. A missing entry means the action cannot be constrained. */
const extractors: Record<string, (request: Fields) => GrantCheck> = {
  withdraw: (request) => destinationCheck(request, "amount"),
  intents_transfer: (request) => destinationCheck(request, "amount"),
  confidential_transfer: (request) => destinationCheck(request, "amount"),
  swap: swapCheck,
  shield: selfDepositCheck,
  unshield: selfDepositCheck,
  confidential_deposit: selfDepositCheck,
  cross_chain_deposit: refundableCheck,
};

/**
 * The recipient/amount/asset shape of one execution action. An action whose destination cannot be
 * decoded fails a recipient allowlist; `amountUnknown` marks value effects that need provider
 * reconciliation.
 */
export function grantCheckForExecution(
  input: ExecutionRequest,
  network: "mainnet" = "mainnet",
  sourceChain?: string,
): GrantCheck {
  const extractor = extractors[input.action];
  // An action with no extractor cannot be constrained, so it must not pass a grant. `delete` is
  // intentionally absent: it is owner-only and never reaches this path.
  if (!extractor) throw new ApiError("grant_action_unsupported", 403);
  const check = extractor(input.request as unknown as Fields);
  const destination = destinationForExecution(input, network, sourceChain);
  if (destination) {
    try {
      check.recipients = [canonicalDestination(destination)];
    } catch {
      throw new ApiError("grant_destination_unresolved", 403);
    }
  }
  return check;
}

/** An identity signature has no spend effects, but its relying-party audience is a recipient. */
export function grantCheckForIdentitySigning(audience: string): GrantCheck {
  return { audience, recipients: [], selfDirected: false, spend: [], amountUnknown: false };
}

function destinationForExecution(
  input: ExecutionRequest,
  network: "mainnet",
  sourceChain?: string,
): GrantDestination | undefined {
  switch (input.action) {
    case "withdraw":
      return {
        action: input.action,
        kind: "chain-address",
        chain: input.request.chain,
        network,
        address: input.request.to,
        memo:
          input.request.memo === undefined
            ? { kind: "none" }
            : { kind: "exact", value: input.request.memo },
        purpose: "payout",
      };
    case "intents_transfer":
    case "confidential_transfer":
      return {
        action: input.action,
        kind: input.action === "intents_transfer" ? "intents-account" : "confidential-account",
        chain: "near",
        network,
        address: input.request.to,
        memo: { kind: "none" },
        purpose: "payout",
      };
    case "cross_chain_deposit":
      if (input.request.refund_address !== undefined) {
        const chain =
          sourceChain ?? (!input.request.source_asset ? input.request.chain : undefined);
        if (!chain) throw new ApiError("grant_destination_unresolved", 403);
        return {
          action: input.action,
          kind: "chain-address",
          chain,
          network,
          address: input.request.refund_address,
          memo: { kind: "none" },
          purpose: "refund",
        };
      }
  }
  return undefined;
}

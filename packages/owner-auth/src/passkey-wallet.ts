import { createPublicKey } from "node:crypto";
import { borshBytes, borshString, borshU32, concat } from "@near-intents-agent-api/contracts/borsh";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";

/** Mainnet P-256 wallet code published by near/intents for the NEP-616 wallet. */
export const PASSKEY_WALLET_CODE_ID = "0saf343be226341c0eca7dba6d0b29d49bdff3ad03";

export type PasskeyWallet = {
  accountId: string;
  publicKey: string;
  stateInitBorsh: Uint8Array;
  stateInit: { V1: { code: { account_id: string }; data: Record<string, string> } };
};

/**
 * Derive NEP-616 account from the same ES256 key stored by demo registration.
 * Layout matches near/intents wallet State and StateInit at deployed P-256 code revision.
 */
export function derivePasskeyWallet(publicKeySpki: string): PasskeyWallet {
  const jwk = createPublicKey({
    key: Buffer.from(publicKeySpki, "base64url"),
    format: "der",
    type: "spki",
  }).export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y)
    throw new Error("passkey_algorithm_unsupported");
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) throw new Error("passkey_algorithm_unsupported");
  const key = concat(new Uint8Array([(y[31] ?? 0) & 1 ? 3 : 2]), x);
  const state = concat(
    new Uint8Array([1]), // signature_enabled
    borshU32(0), // subwallet_id
    key,
    borshU32(3600), // nonce timeout in seconds
    new Uint8Array(8), // last_cleaned_at
    borshU32(0), // old nonce map
    borshU32(0), // current nonce map
    borshU32(0), // extensions
  );
  const stateInitBorsh = concat(
    new Uint8Array([0, 1]), // StateInit::V1, GlobalContractId::AccountId
    borshString(PASSKEY_WALLET_CODE_ID),
    borshU32(1), // one data entry
    borshBytes(new Uint8Array()), // empty state key
    borshBytes(state),
  );
  return {
    accountId: `0s${Buffer.from(keccak_256(stateInitBorsh)).subarray(12).toString("hex")}`,
    publicKey: `p256:${base58.encode(key)}`,
    stateInitBorsh,
    stateInit: {
      V1: {
        code: { account_id: PASSKEY_WALLET_CODE_ID },
        data: { "": Buffer.from(state).toString("base64") },
      },
    },
  };
}

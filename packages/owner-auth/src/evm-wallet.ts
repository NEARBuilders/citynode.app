import { borshBytes, borshString, borshU32, concat } from "@near-intents-agent-api/contracts/borsh";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";

/** Trezu EIP-712 wallet-contract revision; separate from NEP-616 P-256 wallet code. */
export const EVM_WALLET_CODE_ID = "eip712-wallet-contract.trezu.near";

/** Trezu's wallet state binds one 64-byte secp256k1 key to one deterministic 0s account. */
export function deriveEvmWallet(publicKeyHex: string) {
  if (!/^0x[0-9a-f]{128}$/.test(publicKeyHex)) throw new Error("evm_public_key_invalid");
  const key = Buffer.from(publicKeyHex.slice(2), "hex");
  const state = concat(
    new Uint8Array([1]), // signature_enabled
    borshU32(0), // wallet_id
    key,
    borshU32(3600), // timeout_secs
    borshU32(0), // last_cleaned_at
    borshU32(0), // old nonces
    borshU32(0), // current nonces
    borshU32(0), // extensions
  );
  const stateInitBorsh = concat(
    new Uint8Array([0, 1]), // StateInit::V1, GlobalContractId::AccountId
    borshString(EVM_WALLET_CODE_ID),
    borshU32(1),
    borshBytes(new Uint8Array()),
    borshBytes(state),
  );
  return {
    accountId: `0s${Buffer.from(keccak_256(stateInitBorsh)).subarray(12).toString("hex")}`,
    publicKey: `secp256k1:${base58.encode(key)}`,
    stateInitBorsh,
  };
}

export function evmAddressFromPublicKey(publicKeyHex: string) {
  if (!/^0x[0-9a-f]{128}$/.test(publicKeyHex)) throw new Error("evm_public_key_invalid");
  return `0x${Buffer.from(keccak_256(Buffer.from(publicKeyHex.slice(2), "hex")))
    .subarray(12)
    .toString("hex")}`;
}

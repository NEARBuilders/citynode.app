import { sha3_256 } from "@noble/hashes/sha3.js";
import { borshInteger, borshString, borshTimestampNanos, borshU32, concat } from "./borsh.js";

export type OffchainMessage = {
  chain_id: "mainnet";
  signer_id: string;
  timestamp: string;
  payload: string;
  path?: string[];
};

/** SHA3-256 domain hash of NEP-641 OffchainMessage Borsh, per near/intents wallet. */
export function offchainMessageHash(message: OffchainMessage): Uint8Array {
  const nanos = borshTimestampNanos(message.timestamp, true);
  const path = message.path ?? [];
  const serialized = concat(
    borshString(message.chain_id),
    borshString(message.signer_id),
    borshU32(path.length),
    ...path.map(borshString),
    borshInteger(nanos, 8),
    borshString(message.payload),
  );
  return sha3_256(concat(new TextEncoder().encode("NEAR_NEP641_OFFCHAIN_MESSAGE/V1"), serialized));
}

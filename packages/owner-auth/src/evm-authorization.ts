import {
  type EvmWalletRequestMessage,
  evmAuthorizationTypedData,
  evmWalletTypedData,
} from "@near-intents-agent-api/contracts";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";

type TypedData =
  | ReturnType<typeof evmAuthorizationTypedData>
  | ReturnType<typeof evmWalletTypedData>;
const hash = (value: string) => keccak_256(new TextEncoder().encode(value));

/** Trezu wallet-contract EIP-712 digest, limited to its two exact message types. */
function typedDigest(data: TypedData): Uint8Array {
  const domain = keccak_256(
    Buffer.concat([
      hash("EIP712Domain(string name,string version)"),
      hash(data.domain.name),
      hash(data.domain.version),
    ]),
  );
  const fields: Array<{ name: string; type: string }> =
    data.primaryType === "Authorization"
      ? evmAuthorizationTypedData({ purpose: "", recipient: "", payload: "" }).types.Authorization
      : evmWalletTypedData({
          chain_id: "mainnet",
          signer_id: "x.near",
          nonce: 0,
          created_at: "2026-01-01T00:00:00Z",
          timeout_secs: 1,
          request: {
            ops: [],
            out: {
              after: [],
              // biome-ignore lint/suspicious/noThenProperty: Required wallet-contract request field.
              then: [],
            },
          },
        }).types.WalletMessage;
  const typeName = data.primaryType;
  const typeHash = hash(
    `${typeName}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`,
  );
  const values = data.message as unknown as Record<string, string | number>;
  const words = fields.map((field) => {
    const value = values[field.name];
    if (field.type === "string" && typeof value === "string") return hash(value);
    if (
      field.type === "uint32" &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 0xffffffff
    ) {
      const word = Buffer.alloc(32);
      word.writeUInt32BE(value, 28);
      return word;
    }
    throw new Error("evm_typed_data_invalid");
  });
  const struct = keccak_256(Buffer.concat([typeHash, ...words]));
  return keccak_256(Buffer.concat([Buffer.from([0x19, 0x01]), domain, struct]));
}

function recover(digest: Uint8Array, signature: Uint8Array): string {
  if (signature.length !== 65 || signature[64] === undefined || signature[64] > 1)
    throw new Error("evm_wallet_signature_invalid");
  const recovered = secp256k1.Signature.fromBytes(
    Buffer.concat([Buffer.from([signature[64]]), signature.subarray(0, 64)]),
    "recovered",
  );
  if (recovered.hasHighS()) throw new Error("evm_wallet_signature_malleable");
  return `0x${Buffer.from(recovered.recoverPublicKey(digest).toBytes(false).subarray(1)).toString("hex")}`;
}

function signatureBytes(encoded: string): Uint8Array {
  if (!encoded.startsWith("secp256k1:")) throw new Error("evm_wallet_signature_invalid");
  return base58.decode(encoded.slice("secp256k1:".length));
}

export function verifyEvmWalletAuthorization(input: {
  publicKey: string;
  authorization: string;
  recipient: string;
  payload: string;
}) {
  const auth = JSON.parse(input.authorization) as {
    purpose?: unknown;
    recipient?: unknown;
    payload?: unknown;
    signature?: unknown;
  };
  if (
    auth.purpose !== "PROVE_OWNERSHIP" ||
    auth.recipient !== input.recipient ||
    auth.payload !== input.payload ||
    typeof auth.signature !== "string"
  )
    throw new Error("evm_wallet_authorization_invalid");
  const key = recover(
    typedDigest(
      evmAuthorizationTypedData({
        purpose: auth.purpose,
        recipient: auth.recipient,
        payload: auth.payload,
      }),
    ),
    signatureBytes(auth.signature),
  );
  if (key !== input.publicKey) throw new Error("evm_wallet_owner_mismatch");
}

export function verifyEvmWalletRequest(input: {
  publicKey: string;
  message: EvmWalletRequestMessage;
  proof: string;
}) {
  const proof = JSON.parse(input.proof) as Record<string, unknown>;
  const expected = evmWalletTypedData(input.message).message;
  for (const [key, value] of Object.entries(expected))
    if (proof[key] !== value) throw new Error("evm_wallet_request_mismatch");
  if (typeof proof.signature !== "string") throw new Error("evm_wallet_signature_invalid");
  const key = recover(
    typedDigest(evmWalletTypedData(input.message)),
    signatureBytes(proof.signature),
  );
  if (key !== input.publicKey) throw new Error("evm_wallet_owner_mismatch");
}

import { createHash } from "node:crypto";
import {
  canonical,
  type OwnerSigningRequest,
  type OwnerWallet,
} from "@near-intents-agent-api/contracts";

/**
 * Creates the NEP-413 digest for an external wallet signer.
 * The SDK never owns or invokes the owner's private key.
 */
export function ownerNep413SigningDigest(input: {
  message: string;
  recipient: string;
  nonce: Uint8Array;
}): Buffer {
  if (input.nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const encodeString = (value: string) => {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(2147484061);
  return createHash("sha256")
    .update(
      Buffer.concat([
        prefix,
        encodeString(input.message),
        Buffer.from(input.nonce),
        encodeString(input.recipient),
        Buffer.from([0]),
      ]),
    )
    .digest();
}

export function createOwnerSigningRequest(message: {
  owner: OwnerWallet;
  nonce: string;
  recipient: string;
}): OwnerSigningRequest {
  const text = canonical(message);
  return {
    owner: message.owner,
    message: text,
    nonce: message.nonce,
    recipient: message.recipient,
    challenge: createHash("sha256").update(text).digest("base64url"),
  };
}

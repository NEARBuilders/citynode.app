import { p256 } from "@noble/curves/nist.js";
import { base58, base64, base64urlnopad } from "@scure/base";

/**
 * Normalizes raw wallet output into the encodings the owner verifiers and on-chain wallet
 * contracts expect. Clients submit what their wallet returned; only this module knows the
 * contract-side formats.
 */

export class WalletOutputError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * NEP-413 signature as 64-byte lowercase hex. Wallets return `ed25519:<base58>`, base64,
 * base58 or hex; base58 and base64 overlap, so an unprefixed value is accepted in the encoding
 * that yields exactly 64 bytes.
 */
export function nearSignatureHex(value: string): string {
  if (/^[0-9a-f]{128}$/i.test(value)) return value.toLowerCase();
  const prefixed = /^ed25519:([1-9A-HJ-NP-Za-km-z]+)$/.exec(value);
  const candidates: Array<() => Uint8Array> = prefixed
    ? [() => base58.decode(prefixed[1] ?? "")]
    : [() => base64.decode(value), () => base58.decode(value)];
  for (const decode of candidates) {
    try {
      const bytes = decode();
      if (bytes.length === 64) return toHex(bytes);
    } catch {
      // Try the next encoding.
    }
  }
  throw new WalletOutputError("signature_invalid");
}

/**
 * EVM `0x` signature (r ‖ s ‖ v) as the wallet-contract `secp256k1:<base58>` form with a 0/1
 * recovery byte.
 */
export function evmWalletSignature(value: string): string {
  if (!/^0x[0-9a-fA-F]{130}$/.test(value)) throw new WalletOutputError("signature_invalid");
  const bytes = Uint8Array.from(Buffer.from(value.slice(2), "hex"));
  const recovery = bytes[64] ?? -1;
  if (recovery === 27 || recovery === 28) bytes[64] = recovery - 27;
  if (bytes[64] !== 0 && bytes[64] !== 1) throw new WalletOutputError("signature_invalid");
  return `secp256k1:${base58.encode(bytes)}`;
}

/** The subset of a WebAuthn `AuthenticationResponseJSON` the wallet contract needs. */
export type WebauthnAssertion = {
  id: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string };
};

/**
 * NEP-616 passkey proof: authenticator data, the exact client data JSON text and a low-S compact
 * P-256 signature. Authenticators return DER signatures that may carry a high S.
 */
export function passkeyWalletProof(assertion: WebauthnAssertion): string {
  let signature: InstanceType<typeof p256.Signature>;
  try {
    signature = p256.Signature.fromBytes(
      base64urlnopad.decode(assertion.response.signature.replace(/=+$/, "")),
      "der",
    );
  } catch {
    throw new WalletOutputError("signature_invalid");
  }
  const order = p256.Point.Fn.ORDER;
  const lowS =
    signature.s * 2n > order ? new p256.Signature(signature.r, order - signature.s) : signature;
  let clientData: string;
  try {
    clientData = new TextDecoder("utf-8", { fatal: true }).decode(
      base64urlnopad.decode(assertion.response.clientDataJSON.replace(/=+$/, "")),
    );
  } catch {
    throw new WalletOutputError("signature_invalid");
  }
  return JSON.stringify({
    authenticator_data: assertion.response.authenticatorData,
    client_data_json: clientData,
    signature: `p256:${base58.encode(lowS.toBytes("compact"))}`,
  });
}

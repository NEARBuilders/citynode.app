import { createHash, createPublicKey } from "node:crypto";
import type { OwnerProof, OwnerWallet } from "@near-intents-agent-api/contracts";
import { canonical } from "@near-intents-agent-api/contracts";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { convertCOSEtoPKCS, isoCBOR } from "@simplewebauthn/server/helpers";

export { verifyEvmWalletAuthorization, verifyEvmWalletRequest } from "./evm-authorization.js";
export { deriveEvmWallet, EVM_WALLET_CODE_ID, evmAddressFromPublicKey } from "./evm-wallet.js";
export {
  verifyPasskeyChallengeProof,
  verifyPasskeyWalletAuthorization,
} from "./passkey-authorization.js";
export { derivePasskeyWallet, PASSKEY_WALLET_CODE_ID } from "./passkey-wallet.js";
export {
  evmWalletSignature,
  nearSignatureHex,
  passkeyWalletProof,
  WalletOutputError,
  type WebauthnAssertion,
} from "./wallet-output.js";

export type { OwnerProof, OwnerWallet };

/** Fail-closed verification error shared by every owner-proof consumer. */
export class OwnerAuthError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 409 = 401,
  ) {
    super(code);
  }
}

/** Verifies a NEP-413 proof for a NEAR `OwnerWallet`. Chain access stays in the host. */
export type NearProofVerifier = {
  verify(input: {
    accountId: string;
    publicKey: string;
    message: string;
    nonceHex: string;
    recipient: string;
    signatureHex: string;
  }): Promise<void>;
};

/** Consent envelope: canonical JSON plus the nonce/recipient the signature commits to. */
export type OwnerMessage = { nonce: string; recipient: string } & Record<string, unknown>;

export type OwnerProofInput = {
  owner: OwnerWallet;
  message: OwnerMessage;
  proof: OwnerProof;
  counter?: number;
};

export type OwnerProofVerifier = {
  verify(input: OwnerProofInput): Promise<number>;
};

export function assertOwnerIdentity(actual: OwnerWallet | null, expected: OwnerWallet): void {
  if (!actual || canonical(actual) !== canonical(expected))
    throw new OwnerAuthError("owner_mismatch", 409);
}

/**
 * Verifies one owner proof over the canonical JSON of `message`. Returns the next passkey
 * counter so callers can persist replay protection atomically with their own nonce store.
 */
export function createOwnerProofVerifier(dependencies: {
  verifyNear: NearProofVerifier;
}): OwnerProofVerifier {
  return {
    async verify(input) {
      const message = canonical(input.message);
      try {
        switch (input.owner.type) {
          case "near":
            await dependencies.verifyNear.verify({
              accountId: input.owner.accountId,
              publicKey: input.owner.publicKey,
              message,
              nonceHex: input.message.nonce,
              recipient: input.message.recipient,
              signatureHex: signatureOrThrow(input.proof),
            });
            return 0;
          case "evm":
            return verifyEvm(input.owner, input.proof, message);
          case "passkey":
            return await verifyPasskey(input.owner, input.proof, message, input.counter ?? 0);
          default:
            throw new OwnerAuthError("owner_type_unsupported", 400);
        }
      } catch (error) {
        if (error instanceof OwnerAuthError) throw error;
        throw new OwnerAuthError("owner_proof_invalid", 401);
      }
    },
  };
}

function signatureOrThrow(proof: OwnerProof): string {
  if (!("signature" in proof) || !/^[0-9a-f]{128}$/.test(proof.signature))
    throw new Error("signature_format");
  return proof.signature;
}

/**
 * Recovers the lowercase EVM address that produced an EIP-191 `personal_sign` signature
 * over a UTF-8 message. Shared by owner-proof verification and SIWE login checks.
 */
export function recoverEvmAddress(input: {
  message: string;
  signature: `0x${string}` | string;
}): `0x${string}` {
  const publicKey = recoverEvmPublicKey(input);
  return `0x${Buffer.from(keccak_256(Buffer.from(publicKey.slice(2), "hex")))
    .subarray(12)
    .toString("hex")}`;
}

/** Discover the signer key from an owner-approved personal_sign message. */
export function recoverEvmPublicKey(input: {
  message: string;
  signature: `0x${string}` | string;
}): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.signature)) throw new Error("signature_format");
  const signature = Buffer.from(input.signature.slice(2), "hex");
  const recovery = signature[64] ?? -1;
  if (![0, 1, 27, 28].includes(recovery)) throw new Error("signature_recovery");
  const bytes = Buffer.from(input.message);
  const digest = keccak_256(
    Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes]),
  );
  const recovered = secp256k1.Signature.fromBytes(
    Buffer.concat([
      Buffer.from([recovery >= 27 ? recovery - 27 : recovery]),
      signature.subarray(0, 64),
    ]),
    "recovered",
  );
  if (recovered.hasHighS()) throw new Error("signature_malleable");
  const publicKey = recovered.recoverPublicKey(digest).toBytes(false);
  return `0x${Buffer.from(publicKey.subarray(1)).toString("hex")}`;
}

function verifyEvm(
  owner: Extract<OwnerWallet, { type: "evm" }>,
  proof: OwnerProof,
  message: string,
): number {
  if (!("signature" in proof)) throw new Error("signature_format");
  if (recoverEvmAddress({ message, signature: proof.signature }) !== owner.address)
    throw new Error("signature_invalid");
  return 0;
}

/** Requires exact HTTPS origin (localhost HTTP allowed) and a matching RP domain. */
export function assertPasskeyOwnerOrigin(owner: Extract<OwnerWallet, { type: "passkey" }>): URL {
  const origin = new URL(owner.origin);
  if (
    origin.origin !== owner.origin ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && origin.hostname === "localhost"))
  )
    throw new Error("passkey_origin_invalid");
  if (origin.hostname !== owner.rpId && !origin.hostname.endsWith(`.${owner.rpId}`))
    throw new Error("passkey_rp_invalid");
  return origin;
}

/**
 * Converts a base64 (standard, padded) COSE public key — the format Better Auth's passkey
 * plugin stores — into SPKI DER base64url for an `OwnerWallet` descriptor.
 *
 * `convertCOSEtoPKCS` returns only the uncompressed EC point, so the curve parameters are
 * reattached through Node's own SPKI encoder rather than a hand-written DER header.
 */
export function spkiFromCoseBase64(coseBase64: string): string {
  const point = convertCOSEtoPKCS(new Uint8Array(Buffer.from(coseBase64, "base64")));
  if (point[0] !== 0x04 || point.length !== 65) throw new Error("passkey_algorithm_unsupported");
  return createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(point.subarray(1, 33)),
      y: toBase64Url(point.subarray(33)),
    },
    format: "jwk",
  })
    .export({ format: "der", type: "spki" })
    .toString("base64url");
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Converts stored SPKI metadata into the COSE key WebAuthn verification expects. */
export function cosePublicKeyFromSpki(spkiBase64url: string): Uint8Array<ArrayBuffer> {
  const key = createPublicKey({
    key: Buffer.from(spkiBase64url, "base64url"),
    format: "der",
    type: "spki",
  }).export({ format: "jwk" });
  if (key.kty !== "EC" || key.crv !== "P-256" || !key.x || !key.y)
    throw new Error("passkey_algorithm_unsupported");
  return isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(key.x, "base64url")],
      [-3, Buffer.from(key.y, "base64url")],
    ]),
  ) as Uint8Array<ArrayBuffer>;
}

/**
 * Reads the COSE algorithm identifier from a WebAuthn registration response.
 *
 * The algorithm is not a field of the serialized response: `PublicKeyCredential` exposes it to
 * the page, but what reaches the server is `attestationObject`, whose `authData` ends with the
 * COSE key. Returning `null` for an unreadable object lets a caller refuse the credential before
 * storing one it could never verify.
 */
export function coseAlgorithmFromRegistration(response: Record<string, unknown>): number | null {
  // WebAuthn JSON: the attestation sits under `response`, one level below the credential.
  const inner = response.response;
  const attestation =
    typeof response.attestationObject === "string"
      ? response.attestationObject
      : inner && typeof inner === "object"
        ? (inner as { attestationObject?: unknown }).attestationObject
        : undefined;
  if (typeof attestation !== "string") return null;
  try {
    // `decodeFirst` returns CBOR maps as `Map` instances, so the field is read through both shapes.
    const decoded = isoCBOR.decodeFirst(new Uint8Array(Buffer.from(attestation, "base64url"))) as
      | Map<string, unknown>
      | Record<string, unknown>;
    const authData = decoded instanceof Map ? decoded.get("authData") : decoded.authData;
    if (!(authData instanceof Uint8Array)) return null;
    // authData: rpIdHash(32) | flags(1) | counter(4) | [aaguid(16) | credIdLen(2) | credId | COSE].
    const flags = authData[32] ?? 0;
    if ((flags & 0x40) === 0) return null;
    const credentialIdLength = ((authData[53] ?? 0) << 8) | (authData[54] ?? 0);
    const coseStart = 55 + credentialIdLength;
    const coseBytes = Uint8Array.from(authData.subarray(coseStart));
    const cose = isoCBOR.decodeFirst(coseBytes) as Map<number, unknown>;
    // COSE key labels are negative/positive integers; the algorithm is label 3.
    const algorithm = cose instanceof Map ? cose.get(3) : (cose as Record<string, unknown>)["3"];
    return typeof algorithm === "number" ? algorithm : null;
  } catch {
    return null;
  }
}

/** WebAuthn challenge value: base64url SHA-256 of the canonical message. */
export function ownerChallengeDigest(message: string): string {
  return createHash("sha256").update(message).digest("base64url");
}

async function verifyPasskey(
  owner: Extract<OwnerWallet, { type: "passkey" }>,
  proof: OwnerProof,
  message: string,
  counter: number,
): Promise<number> {
  if (!("authentication" in proof)) throw new Error("signature_format");
  const clientData = JSON.parse(
    Buffer.from(proof.authentication.response.clientDataJSON, "base64url").toString("utf8"),
  ) as { crossOrigin?: boolean; topOrigin?: string };
  if (
    (clientData.crossOrigin !== undefined && clientData.crossOrigin !== false) ||
    clientData.topOrigin !== undefined
  )
    throw new Error("passkey_cross_origin_unsupported");
  assertPasskeyOwnerOrigin(owner);
  const result = await verifyAuthenticationResponse({
    response: proof.authentication,
    expectedChallenge: ownerChallengeDigest(message),
    expectedOrigin: owner.origin,
    expectedRPID: owner.rpId,
    requireUserVerification: true,
    credential: {
      id: owner.credentialId,
      publicKey: cosePublicKeyFromSpki(owner.publicKey),
      counter,
    },
  });
  if (!result.verified) throw new Error("signature_invalid");
  return result.authenticationInfo.newCounter;
}

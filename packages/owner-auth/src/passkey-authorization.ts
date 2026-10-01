import { createHash } from "node:crypto";
import {
  type OffchainMessage,
  type OwnerWallet,
  offchainMessageHash,
} from "@near-intents-agent-api/contracts";
import { p256 } from "@noble/curves/nist.js";
import { base58 } from "@scure/base";
import { derivePasskeyWallet } from "./passkey-wallet.js";

type PasskeyOwner = Extract<OwnerWallet, { type: "passkey" }>;

function decodeBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  return Buffer.from(value, "base64url");
}

/** Verify owner possession before sponsoring a not-yet-created NEP-616 wallet. */
export function verifyPasskeyWalletAuthorization(input: {
  owner: PasskeyOwner;
  accountId: string;
  authorization: string;
  expectedPayload: string;
  nowMs?: number;
}): void {
  const wallet = derivePasskeyWallet(input.owner.publicKey);
  if (wallet.accountId !== input.accountId) throw new Error("wallet_account_mismatch");
  if (input.authorization.length > 32_768) throw new Error("wallet_authorization_too_large");
  const authorization = JSON.parse(input.authorization) as {
    signature?: { msg?: OffchainMessage; proof?: string };
  };
  const message = authorization.signature?.msg;
  const proofText = authorization.signature?.proof;
  if (!message || !proofText || proofText.length > 16_384) throw new Error("wallet_proof_invalid");
  const signedAt = Date.parse(message.timestamp);
  const now = input.nowMs ?? Date.now();
  if (
    message.chain_id !== "mainnet" ||
    message.signer_id !== input.accountId ||
    message.payload !== input.expectedPayload ||
    (message.path?.length ?? 0) !== 0 ||
    !Number.isFinite(signedAt) ||
    signedAt > now + 30_000 ||
    signedAt < now - 300_000
  )
    throw new Error("wallet_message_invalid");
  verifyPasskeyChallengeProof({
    owner: input.owner,
    proofText,
    challenge: offchainMessageHash(message),
  });
}

/** Local preflight before spending sponsor gas; contract remains final transaction authority. */
export function verifyPasskeyChallengeProof(input: {
  owner: PasskeyOwner;
  proofText: string;
  challenge: Uint8Array;
}): void {
  const proof = JSON.parse(input.proofText) as {
    authenticator_data?: string;
    client_data_json?: string;
    signature?: string;
  };
  if (!proof.authenticator_data || !proof.client_data_json || !proof.signature?.startsWith("p256:"))
    throw new Error("wallet_proof_invalid");
  const authenticatorData = decodeBase64url(proof.authenticator_data);
  if (authenticatorData.length < 37) throw new Error("wallet_authenticator_data_invalid");
  const rpHash = createHash("sha256").update(input.owner.rpId).digest();
  if (!Buffer.from(authenticatorData.subarray(0, 32)).equals(rpHash))
    throw new Error("wallet_rp_mismatch");
  const flags = authenticatorData[32] ?? 0;
  if ((flags & 0x05) !== 0x05) throw new Error("wallet_user_verification_required");
  const clientData = JSON.parse(proof.client_data_json) as {
    type?: string;
    challenge?: string;
    origin?: string;
    crossOrigin?: boolean;
  };
  if (
    clientData.type !== "webauthn.get" ||
    clientData.origin !== input.owner.origin ||
    clientData.crossOrigin === true ||
    clientData.challenge !== Buffer.from(input.challenge).toString("base64url")
  )
    throw new Error("wallet_challenge_mismatch");
  const signature = base58.decode(proof.signature.slice(5));
  if (signature.length !== 64) throw new Error("wallet_signature_invalid");
  const signedBytes = Buffer.concat([
    authenticatorData,
    createHash("sha256").update(proof.client_data_json).digest(),
  ]);
  const publicKey = base58.decode(derivePasskeyWallet(input.owner.publicKey).publicKey.slice(5));
  if (!p256.verify(signature, signedBytes, publicKey, { format: "compact" }))
    throw new Error("wallet_signature_invalid");
}

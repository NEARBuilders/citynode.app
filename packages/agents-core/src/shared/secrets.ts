import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getRuntime } from "../config/runtime.js";

const algorithm = "aes-256-gcm";
const contextSeparator = "\u0000";

/**
 * Ciphertext is only meaningful for the exact record it was written for. Without this, a valid
 * ciphertext/nonce pair can be relocated between rows and the honest service will happily decrypt
 * a credential that belongs to a different tenant, agent or wallet. The AAD is rebuilt from the
 * row's own columns on every read, so a relocated tuple fails authentication instead of
 * decrypting into the wrong context.
 */
export type SecretContext = {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  /** Immutable row id. Empty while a wallet is still provisioning. */
  walletId: string;
  /** Provider-visible wallet identity, when one is already known. */
  providerId?: string;
  purpose: string;
  /** Artifact binding fields; wallet credentials use wallet identity instead. */
  operationId?: string;
  grantId?: string;
  ownerEpoch?: number;
  signingAction?: string;
};

export function canonicalSecretContext(context: SecretContext) {
  const fields = [
    `v${context.schemaVersion}`,
    context.tenantId,
    context.agentId,
    context.walletId,
    context.providerId ?? "",
    context.purpose,
  ];
  if (
    context.operationId ||
    context.grantId ||
    context.ownerEpoch !== undefined ||
    context.signingAction
  ) {
    fields.push(
      `operation:${context.operationId ?? ""}`,
      `grant:${context.grantId ?? ""}`,
      `owner_epoch:${context.ownerEpoch ?? ""}`,
      `signing_action:${context.signingAction ?? ""}`,
    );
  }
  return fields.join(contextSeparator);
}

function encryptionKey(keyId: string) {
  const runtime = getRuntime();
  const secret =
    runtime.secretEncryptionKeys?.[keyId] ??
    (keyId === "env:v1" ? runtime.secretEncryptionKey : undefined);
  if (!secret) throw new Error(`Unknown secret key id: ${keyId}`);
  return createHash("sha256").update(secret).digest();
}

export type SealedSecret = {
  ciphertext: string;
  keyId: string;
  nonce: string;
};

export function sealSecret(plaintext: string, context: SecretContext): SealedSecret {
  const keyId = getRuntime().secretEncryptionActiveKeyId ?? "env:v1";
  const nonce = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(keyId), nonce);
  cipher.setAAD(Buffer.from(canonicalSecretContext(context), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ciphertext, tag]).toString("base64url"),
    keyId,
    nonce: nonce.toString("base64url"),
  };
}

export function openSecret(secret: SealedSecret, context: SecretContext) {
  const payload = Buffer.from(secret.ciphertext, "base64url");
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv(
    algorithm,
    encryptionKey(secret.keyId),
    Buffer.from(secret.nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(canonicalSecretContext(context), "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

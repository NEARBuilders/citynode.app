import { createHash, randomBytes } from "node:crypto";

/** A new grant token and the commitment the owner signs for it (upstream SDK scheme). */
export type GrantCredential = { token: string; commitment: string };

export function grantCommitment(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createGrantCredential(): GrantCredential {
  const token = `ngt_${randomBytes(32).toString("base64url")}`;
  return { token, commitment: grantCommitment(token) };
}

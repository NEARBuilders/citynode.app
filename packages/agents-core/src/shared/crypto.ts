import { createHash, randomBytes } from "node:crypto";

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newId() {
  return randomBytes(32).toString("hex");
}

export function newApiToken() {
  return `naa_${randomBytes(32).toString("base64url")}`;
}

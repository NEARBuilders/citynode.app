import { tenants } from "@near-intents-agent-api/database";
import { eq } from "drizzle-orm";
import { getRuntime } from "../../config/runtime.js";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret, newApiToken, newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { toApiKeyDto } from "./mapper.js";
import { effectiveQuota } from "./quota-service.js";
import {
  ApiKeyQuotaExceededError,
  consumeQuota,
  findApiKey,
  persistApiKey,
  revokeApiKey,
  selectApiKeys,
  upsertTenant,
} from "./repository.js";

export async function ensureDeveloperTenant(userId: string) {
  return upsertTenant(userId, newId());
}

const defaultMaxApiKeysPerTenant = 50;

export async function createApiKey(tenantId: string, input: { name: string; expiresAt: string }) {
  const expiry = Date.parse(input.expiresAt);
  if (expiry <= Date.now() || expiry > Date.now() + 366 * 86400000)
    throw new ApiError("invalid_key_expiry");
  const token = newApiToken();
  const id = newId();
  try {
    await persistApiKey(
      {
        id,
        tenantId,
        name: input.name,
        tokenHash: hashSecret(token),
        prefix: token.slice(0, 12),
        expiresAt: new Date(input.expiresAt),
      },
      getRuntime().maxApiKeysPerTenant ?? defaultMaxApiKeysPerTenant,
    );
  } catch (error) {
    if (error instanceof ApiKeyQuotaExceededError) throw new ApiError(error.message, 409);
    throw error;
  }
  return {
    id,
    name: input.name,
    prefix: token.slice(0, 12),
    expiresAt: new Date(input.expiresAt).toISOString(),
    revokedAt: null,
    token,
  };
}

export async function listApiKeys(tenantId: string) {
  return (await selectApiKeys(tenantId)).map(toApiKeyDto);
}

/**
 * Revocation refuses every dispatch that has not committed. `committed_operation_ids` lists the
 * delegated operations that committed first: the revocation cannot retract their provider writes.
 * `committed_truncated` is true when more than the listed operations committed.
 */
export async function deleteApiKey(tenantId: string, id: string) {
  const committed = await revokeApiKey(tenantId, id);
  if (!committed) throw new ApiError("key_not_found", 404);
  return {
    revoked: true as const,
    committed_operation_ids: committed.ids,
    committed_truncated: committed.truncated,
  };
}

export async function authenticateApiKey(token: string | undefined): Promise<Actor> {
  if (!token || !/^naa_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError("invalid_api_key", 401);
  const key = await findApiKey(hashSecret(token));
  if (!key) throw new ApiError("invalid_api_key", 401);
  // Per key, so one noisy caller cannot starve its siblings; per tenant too, so minting more keys
  // cannot multiply the tenant's allowance.
  const exceeded = await getDatabase().transaction(async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, key.tenantId))
      .for("share");
    if (!tenant) throw new ApiError("invalid_api_key", 401);
    const limits = effectiveQuota(tenant.quotaProfile);
    const keyUsage = await consumeQuota(`key:${key.id}`, tx);
    const tenantUsage = await consumeQuota(`tenant:${key.tenantId}`, tx);
    return keyUsage > limits.keyRequestsPerMinute || tenantUsage > limits.requestsPerMinute;
  });
  if (exceeded) throw new ApiError("rate_limited", 429);
  return {
    tenantId: key.tenantId,
    keyId: key.id,
  };
}

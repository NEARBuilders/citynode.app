import { ApiError } from "@near-intents-agent-api/agents-core";

export function requireIdempotencyKey(key: string | undefined): string {
  if (!key) throw new ApiError("idempotency_key_required", 400);
  return key;
}

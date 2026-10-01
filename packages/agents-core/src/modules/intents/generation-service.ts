import { randomUUID } from "node:crypto";
import type { GenerateIntentRequest } from "@near-intents-agent-api/contracts/api";
import { intentGenerations } from "@near-intents-agent-api/database";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";

type Generation = typeof intentGenerations.$inferSelect;

/** Caller holds the tenant/key advisory lock. The row outlives its connection and process. */
export async function reserveGeneration(
  actor: Actor,
  request: GenerateIntentRequest,
  requestHash: string,
  idempotencyKey?: string,
): Promise<Generation> {
  const existing = idempotencyKey
    ? (
        await getDatabase()
          .select()
          .from(intentGenerations)
          .where(
            and(
              eq(intentGenerations.tenantId, actor.tenantId),
              eq(intentGenerations.idempotencyKey, idempotencyKey),
            ),
          )
      )[0]
    : undefined;
  if (existing) {
    if (existing.requestHash !== requestHash) throw new ApiError("idempotency_conflict", 409);
    return existing;
  }
  const [reserved] = await getDatabase()
    .insert(intentGenerations)
    .values({
      id: randomUUID(),
      tenantId: actor.tenantId,
      idempotencyKey: idempotencyKey ?? null,
      requestHash,
      agentId: request.type === "agent_create" ? newId() : request.agentId,
    })
    .returning();
  if (!reserved) throw new Error("intent_generation_reservation_failed");
  return reserved;
}

export async function buildReservedDraft<T>(
  generation: Generation,
  build: () => Promise<T>,
  recover?: () => Promise<T | undefined>,
): Promise<T> {
  if (generation.draft) return generation.draft as T;
  let draft: T;
  if (generation.state === "reserved") {
    await getDatabase()
      .update(intentGenerations)
      .set({ state: "building" })
      .where(eq(intentGenerations.id, generation.id));
    draft = await build();
  } else {
    // A started builder may have contacted custody. Only durable evidence may resume it.
    const recovered = await recover?.();
    if (!recovered) throw new ApiError("intent_generation_recovery_required", 409);
    draft = recovered;
  }
  await getDatabase()
    .update(intentGenerations)
    .set({ draft, state: "ready" })
    .where(eq(intentGenerations.id, generation.id));
  return draft;
}

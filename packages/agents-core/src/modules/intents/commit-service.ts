import { ownerIntents, type Tx } from "@near-intents-agent-api/database";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "../../shared/errors.js";

/** Acceptance is decided after domain locks; failure rolls the entire effect and nonce back. */
export async function commitOwnerIntent(
  tx: Tx,
  tenantId: string,
  id: string,
  result: unknown,
  state: "completed" | "submitted" = "completed",
  operationId?: string,
) {
  const [row] = await tx
    .select()
    .from(ownerIntents)
    .where(and(eq(ownerIntents.tenantId, tenantId), eq(ownerIntents.id, id)))
    .for("update");
  if (row?.state !== "pending_signature") throw new ApiError("intent_not_pending", 409);
  const changed = await tx
    .update(ownerIntents)
    .set({
      state,
      result,
      ...(operationId ? { operationId } : {}),
      updatedAt: sql`clock_timestamp()`,
    })
    .where(and(eq(ownerIntents.id, id), sql`${ownerIntents.expiresAt} > clock_timestamp()`))
    .returning({ id: ownerIntents.id });
  if (!changed.length) throw new ApiError("intent_expired", 409);
}

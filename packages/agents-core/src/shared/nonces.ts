import { ownerNonces, type Tx } from "@near-intents-agent-api/database";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "../lib/db.js";
import { newId } from "./crypto.js";
import { ApiError } from "./errors.js";

const NONCE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_BATCH = 500;

export async function issueOwnerNonce(tenantId: string, agentId: string) {
  const nonce = newId();
  await getDatabase()
    .insert(ownerNonces)
    .values({
      nonce,
      tenantId,
      agentId,
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    });
  return nonce;
}

/** Atomically consumes a single-use owner nonce. Replays and expired nonces fail closed. */
export async function consumeOwnerNonce(tenantId: string, agentId: string, nonce: string) {
  const consumed = await getDatabase()
    .delete(ownerNonces)
    .where(
      and(
        eq(ownerNonces.nonce, nonce),
        eq(ownerNonces.tenantId, tenantId),
        eq(ownerNonces.agentId, agentId),
        sql`${ownerNonces.expiresAt} > now()`,
      ),
    )
    .returning({ nonce: ownerNonces.nonce });
  if (!consumed.length) throw new ApiError("owner_nonce_invalid", 409);
}

/** Consumes a nonce inside the state transition transaction for owner admin commands. */
export async function consumeOwnerNonceInTransaction(
  tx: Tx,
  tenantId: string,
  agentId: string,
  nonce: string,
) {
  const consumed = await tx
    .delete(ownerNonces)
    .where(
      and(
        eq(ownerNonces.nonce, nonce),
        eq(ownerNonces.tenantId, tenantId),
        eq(ownerNonces.agentId, agentId),
        sql`${ownerNonces.expiresAt} > now()`,
      ),
    )
    .returning({ nonce: ownerNonces.nonce });
  if (!consumed.length) throw new ApiError("owner_nonce_invalid", 409);
}

/**
 * Deletes expired nonces in bounded batches.
 *
 * This used to run on every challenge as an unbounded `DELETE ... WHERE expires_at < ...`,
 * which scanned the table and could delete an unbounded number of rows inside the request that
 * needed the nonce. Cleanup is now a scheduled sweep: correctness never depends on it, because
 * `consumeOwnerNonce` already rejects expired rows.
 */
export async function sweepExpiredOwnerNonces(): Promise<number> {
  let deletedTotal = 0;
  for (;;) {
    const deleted = await getDatabase()
      .delete(ownerNonces)
      .where(
        sql`${ownerNonces.nonce} in (
          select ${ownerNonces.nonce} from ${ownerNonces}
          where ${ownerNonces.expiresAt} < now() - interval '10 minutes'
          limit ${CLEANUP_BATCH}
        )`,
      )
      .returning({ nonce: ownerNonces.nonce });
    deletedTotal += deleted.length;
    if (deleted.length < CLEANUP_BATCH) return deletedTotal;
  }
}

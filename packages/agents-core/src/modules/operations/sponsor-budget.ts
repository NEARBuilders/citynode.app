import { auditEvents, sponsorReservations, tenants } from "@near-intents-agent-api/database";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { getRuntime } from "../../config/runtime.js";
import { getDatabase } from "../../lib/db.js";
import { ApiError } from "../../shared/errors.js";

/**
 * Sponsorship budget accounting used to count reservations and subtract releases in one query that
 * correlated the release with the *requesting* operation instead of the reservation being counted.
 * The effect was that a released reservation stayed charged to every later operation until it aged
 * out, so abandoned work could exhaust an agent's whole daily budget.
 *
 * The accounting is now an explicit reservation row with one state. Released reservations are
 * excluded by joining the reservation to its own release state, and the state transition is atomic
 * so a double release can never credit twice.
 */

/** Cross-process serialization; survives restarts, unlike an in-memory limiter. */
const budgetLockKey = 1935764846;

export async function reserveSponsorship(tenantId: string, agentId: string, operationId: string) {
  const runtime = getRuntime();
  await getDatabase().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${budgetLockKey})`);
    const [tenantRow] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("share");
    if (!tenantRow) throw new ApiError("tenant_not_found", 404);
    const tenantLimit = tenantRow.quotaProfile.sponsorDaily ?? runtime.sponsorDailyTenantLimit;
    const agentLimit =
      tenantRow.quotaProfile.sponsorDailyPerAgent ?? runtime.sponsorDailyAgentLimit;
    const [existing] = await tx
      .select({ id: sponsorReservations.operationId })
      .from(sponsorReservations)
      .where(eq(sponsorReservations.operationId, operationId))
      .limit(1);
    if (existing) return;
    const charged = and(
      gte(sponsorReservations.createdAt, new Date(Date.now() - 86400000)),
      isNull(sponsorReservations.releasedAt),
    );
    const [global] = await tx.select({ value: count() }).from(sponsorReservations).where(charged);
    const [tenant] = await tx
      .select({ value: count() })
      .from(sponsorReservations)
      .where(and(charged, eq(sponsorReservations.tenantId, tenantId)));
    const [agent] = await tx
      .select({ value: count() })
      .from(sponsorReservations)
      .where(
        and(
          charged,
          eq(sponsorReservations.tenantId, tenantId),
          eq(sponsorReservations.agentId, agentId),
        ),
      );
    if (
      (global?.value ?? 0) >= runtime.sponsorDailyGlobalLimit ||
      (tenant?.value ?? 0) >= tenantLimit ||
      (agent?.value ?? 0) >= agentLimit
    )
      throw new ApiError("sponsor_daily_budget_exhausted", 429);
    await tx.insert(sponsorReservations).values({
      operationId,
      tenantId,
      agentId,
      state: "reserved",
    });
    await tx
      .insert(auditEvents)
      .values({ tenantId, agentId, action: "sponsor.reserved", resourceId: operationId });
  });
}

/**
 * Refunds a reservation for work that provably never broadcast. The row transition is conditional
 * on `reserved`, so concurrent or repeated releases are a no-op rather than a second credit. Never
 * call this once a transaction hash exists: that spend is real even if it later fails.
 */
export async function releaseSponsorship(
  tenantId: string,
  agentId: string,
  operationId: string,
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${budgetLockKey})`);
    const released = await tx
      .update(sponsorReservations)
      .set({ state: "released", releasedAt: new Date() })
      .where(
        and(
          eq(sponsorReservations.operationId, operationId),
          eq(sponsorReservations.state, "reserved"),
        ),
      )
      .returning({ id: sponsorReservations.operationId });
    if (released.length !== 1) return;
    await tx
      .insert(auditEvents)
      .values({ tenantId, agentId, action: "sponsor.released", resourceId: operationId });
  });
}

/**
 * Marks a reservation as committed: the sponsored work may have broadcast, so the budget slot is
 * consumed permanently and a later release cannot refund it.
 */
export async function commitSponsorship(operationId: string): Promise<void> {
  await getDatabase()
    .update(sponsorReservations)
    .set({ state: "committed" })
    .where(
      and(
        eq(sponsorReservations.operationId, operationId),
        eq(sponsorReservations.state, "reserved"),
      ),
    );
}

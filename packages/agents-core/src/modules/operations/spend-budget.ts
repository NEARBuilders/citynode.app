import type { BudgetView, ExecutionRequest } from "@near-intents-agent-api/contracts";
import { agents, auditEvents, spendCharges, type Tx } from "@near-intents-agent-api/database";
import { and, eq, gte, isNull, min, sql, sum } from "drizzle-orm";
import { databaseClock, getDatabase } from "../../lib/db.js";
import { type AssetPrice, isPriceFresh, usdMicros } from "../../lib/prices.js";
import { ApiError } from "../../shared/errors.js";

/**
 * The owner's USD spend budget, enforced by this API on top of OutLayer's per-asset limits.
 *
 * OutLayer caps each token separately; it has no notion of "$200 a day across everything". The
 * owner signs up to three caps (rolling 24 h, 7 d, 30 d) and every execution that moves value out
 * of the agent is valued in USD and charged against them at its dispatch commitment.
 *
 * The charge is decided and inserted inside the commitment's own transaction (`commitDispatch`),
 * which already holds the agent row a budget change needs. So an owner's cap change and a dispatch
 * are strictly ordered: a change that commits first governs the dispatch, and one that commits
 * after cannot retract it. There is no separate reservation between admission and commitment, so
 * a crashed or stalled attempt leaves nothing to strand, and a losing attempt has nothing to
 * refund. The per-agent advisory lock only serializes the sum-then-insert of concurrent charges.
 *
 * As with sponsorship, only a write that provably never reached the provider is refunded, and only
 * by the attempt that won its commitment; anything that may have broadcast stays counted.
 */

const hourMs = 60 * 60 * 1000;
export const budgetWindows = {
  daily: 24 * hourMs,
  weekly: 7 * 24 * hourMs,
  monthly: 30 * 24 * hourMs,
} as const;
type Window = keyof typeof budgetWindows;
const windowNames = Object.keys(budgetWindows) as Window[];

/** One cent in millionths of a dollar, the unit charges are counted in. */
const microsPerCent = 10_000;

/** The asset and atomic amount an execution moves out of the agent, or none if it stays inside. */
export function spendOf(input: ExecutionRequest): { asset: string; amount: string } | undefined {
  switch (input.action) {
    case "swap":
      return { asset: input.request.token_in, amount: input.request.amount_in };
    case "withdraw":
    case "intents_transfer":
    case "confidential_transfer":
      return { asset: input.request.token, amount: input.request.amount };
    default:
      // Shield, unshield and deposits move the owner's own funds between the agent's balances.
      return undefined;
  }
}

/** `"1000.50"` → cents. The contract already restricts the shape. */
export function centsFromUsd(usd: string | null): number | null {
  if (usd === null) return null;
  const [whole = "0", fraction = ""] = usd.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function usdFromCents(cents: number | null): string | null {
  if (cents === null) return null;
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function usdFromMicros(micros: number): string {
  return `${Math.floor(micros / 1_000_000)}.${String(micros % 1_000_000).padStart(6, "0")}`;
}

type BudgetCaps = Pick<
  typeof agents.$inferSelect,
  "budgetDailyCents" | "budgetWeeklyCents" | "budgetMonthlyCents"
>;

function capsOf(agent: BudgetCaps): Record<Window, number | null> {
  return {
    daily: agent.budgetDailyCents,
    weekly: agent.budgetWeeklyCents,
    monthly: agent.budgetMonthlyCents,
  };
}

/** Counted spend: every charge not refunded, from `since`. */
function counted(tenantId: string, agentId: string, since: Date) {
  return and(
    eq(spendCharges.tenantId, tenantId),
    eq(spendCharges.agentId, agentId),
    isNull(spendCharges.releasedAt),
    gte(spendCharges.chargedAt, since),
  );
}

async function spentSince(tx: Tx, tenantId: string, agentId: string, since: Date) {
  const [row] = await tx
    .select({ total: sum(spendCharges.usdMicros), oldest: min(spendCharges.chargedAt) })
    .from(spendCharges)
    .where(counted(tenantId, agentId, since));
  return { micros: Number(row?.total ?? 0), oldest: row?.oldest ?? null };
}

/**
 * The charge needs a price the caller has not supplied, or the one supplied went stale while the
 * transaction waited for its locks. Internal: the caller rolls back, prices outside any lock and
 * decides again from the top, so a cap that appeared in the meantime is never skipped.
 */
export class PriceRequired extends Error {
  constructor() {
    super("price_required");
  }
}

/** An amount too large to value is larger than any cap can hold. */
function chargeValue(amount: string, price: AssetPrice): number {
  try {
    return usdMicros(amount, price);
  } catch (error) {
    if (error instanceof RangeError) throw new ApiError("spend_budget_exceeded", 403);
    throw error;
  }
}

/**
 * Charges an execution's USD value against the agent's caps inside its dispatch commitment, or
 * refuses it, which rolls the commitment back. `agent` is the row the commitment holds locked, so
 * its caps are current and cannot change until the transaction ends. A no-op for uncounted actions
 * and accounts never configured with any budget. Configured accounts keep tracking with fresh
 * prices even when every cap is null.
 */
export async function chargeSpend(
  tx: Tx,
  agent: typeof agents.$inferSelect,
  operationId: string,
  token: string,
  input: ExecutionRequest,
  price: AssetPrice | undefined,
): Promise<void> {
  const spend = spendOf(input);
  if (!spend) return;
  const caps = capsOf(agent);
  // Once the owner has configured this account's budget, keep recording during uncapped
  // periods too. Temporarily clearing caps must not erase spend when caps are restored.
  if (agent.budgetRevision === 0 && windowNames.every((name) => caps[name] === null)) return;
  if (!price) throw new PriceRequired();

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spend:${agent.tenantId}:${agent.id}`}, 0))`,
  );
  // Decided at database time after every wait, so the windows, the row's timestamp and the price's
  // age all describe the same instant.
  const decidedAt = await databaseClock(tx);
  if (!isPriceFresh(price, decidedAt.getTime())) throw new PriceRequired();
  const micros = chargeValue(spend.amount, price);
  for (const name of windowNames) {
    const cap = caps[name];
    if (cap === null) continue;
    const { micros: spent } = await spentSince(
      tx,
      agent.tenantId,
      agent.id,
      new Date(decidedAt.getTime() - budgetWindows[name]),
    );
    if (spent + micros > cap * microsPerCent) throw new ApiError("spend_budget_exceeded", 403);
  }
  await tx.insert(spendCharges).values({
    operationId,
    tenantId: agent.tenantId,
    agentId: agent.id,
    action: input.action,
    asset: spend.asset,
    amount: spend.amount,
    usdMicros: micros,
    decimals: price.decimals,
    priceCoefficient: price.coefficient.toString(),
    priceScale: price.scale,
    priceUpdatedAt: new Date(price.updatedAtMs),
    budgetRevision: agent.budgetRevision,
    dispatchToken: token,
    state: "committed",
    chargedAt: decidedAt,
  });
  await tx.insert(auditEvents).values({
    tenantId: agent.tenantId,
    agentId: agent.id,
    action: "spend.charged",
    resourceId: operationId,
  });
}

/**
 * Refunds the charge of a write the provider refused before admitting it. Bound to the receipt of
 * the commitment that created the charge, so no other attempt at the same operation can refund it,
 * and conditional on `committed`, so a repeat is a no-op rather than a second credit.
 */
export async function refundSpend(
  tenantId: string,
  agentId: string,
  operationId: string,
  token: string,
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const released = await tx
      .update(spendCharges)
      .set({ state: "released", releasedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(spendCharges.tenantId, tenantId),
          eq(spendCharges.agentId, agentId),
          eq(spendCharges.operationId, operationId),
          eq(spendCharges.dispatchToken, token),
          eq(spendCharges.state, "committed"),
        ),
      )
      .returning({ id: spendCharges.operationId });
    if (released.length !== 1) return;
    await tx
      .insert(auditEvents)
      .values({ tenantId, agentId, action: "spend.released", resourceId: operationId });
  });
}

/**
 * Caps and how much of each window is charged, for the owner and the agent to read. Charged
 * usage includes work whose outcome is still uncertain, since that may have moved value. Read as
 * one snapshot at database time, so the caps and every window agree with what a dispatch decides.
 */
export async function readBudgetFor(
  tenantId: string,
  agentId: string,
  tx?: Tx,
): Promise<BudgetView> {
  if (!tx) {
    return getDatabase().transaction((snapshot) => readBudgetFor(tenantId, agentId, snapshot), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
  const [agent] = await tx
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  if (!agent) throw new ApiError("agent_not_found", 404);
  const caps = capsOf(agent);
  const now = (await databaseClock(tx)).getTime();
  const usage = {} as Record<Window, BudgetView["daily"]>;
  for (const name of windowNames) {
    const { micros: spent, oldest } = await spentSince(
      tx,
      tenantId,
      agentId,
      new Date(now - budgetWindows[name]),
    );
    const cap = caps[name];
    usage[name] = {
      limit_usd: usdFromCents(cap),
      spent_usd: usdFromMicros(spent),
      remaining_usd: cap === null ? null : usdFromMicros(Math.max(0, cap * microsPerCent - spent)),
      resets_at: oldest ? new Date(oldest.getTime() + budgetWindows[name]).toISOString() : null,
    };
  }
  return { ...usage, revision: agent.budgetRevision, enforced_by: "agent_api" };
}

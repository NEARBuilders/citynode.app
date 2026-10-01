import {
  type BudgetSettings,
  type BudgetWrite,
  canonical,
} from "@near-intents-agent-api/contracts";
import { agents, auditEvents } from "@near-intents-agent-api/database";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { consumeOwnerNonceInTransaction } from "../../shared/nonces.js";
import {
  assertOwnerAdminCommand,
  ownerAdminCommandChallenge,
  ownerPrincipalId,
  verifyOwnerAdminCommand,
} from "../agents/owner-admin-command.js";
import { recordOwnerReceipt } from "../agents/owner-receipts.js";
import { requireBoundAgent } from "../agents/service.js";
import { centsFromUsd, readBudgetFor } from "./spend-budget.js";

export { readBudgetFor } from "./spend-budget.js";

export async function readBudget(actor: Actor, agentId: string) {
  return readBudgetFor(actor.tenantId, agentId);
}

function target(settings: BudgetSettings, expected_revision: number) {
  return hashSecret(
    canonical({
      daily_usd: settings.daily_usd,
      weekly_usd: settings.weekly_usd,
      monthly_usd: settings.monthly_usd,
      expected_revision,
    }),
  );
}

export async function budgetChallenge(actor: Actor, agentId: string, settings: BudgetSettings) {
  const { agent } = await requireBoundAgent(actor, agentId);
  return {
    ...(await ownerAdminCommandChallenge(
      actor,
      agent,
      "set_budget",
      target(settings, agent.budgetRevision),
    )),
    daily_usd: settings.daily_usd,
    weekly_usd: settings.weekly_usd,
    monthly_usd: settings.monthly_usd,
    expected_revision: agent.budgetRevision,
  };
}

/**
 * Replaces the agent's USD caps under the owner's signature. The update takes the agent row that
 * every dispatch commitment holds while it decides its charge, so it is ordered against each one:
 * a dispatch that commits first is charged under the old caps and cannot be retracted, and every
 * later one sees these. Charges already made stay counted, so lowering a cap below current spend
 * blocks further spend until the window frees up.
 */
export async function setBudget(
  actor: Actor,
  agentId: string,
  input: BudgetWrite,
  onCommit?: CommitEffect<Awaited<ReturnType<typeof readBudgetFor>>>,
  original?: unknown,
) {
  const { agent } = await requireBoundAgent(actor, agentId);
  const { message, proof } = input;
  assertOwnerAdminCommand(
    actor,
    agent,
    "set_budget",
    target(message, message.expected_revision),
    message,
  );
  const verification = await verifyOwnerAdminCommand(agent, message, proof);
  return getDatabase().transaction(async (tx) => {
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, message.nonce);
    const changed = await tx
      .update(agents)
      .set({
        budgetDailyCents: centsFromUsd(message.daily_usd),
        budgetWeeklyCents: centsFromUsd(message.weekly_usd),
        budgetMonthlyCents: centsFromUsd(message.monthly_usd),
        budgetRevision: sql`${agents.budgetRevision} + 1`,
      })
      .where(
        and(
          eq(agents.tenantId, actor.tenantId),
          eq(agents.id, agentId),
          eq(agents.budgetRevision, message.expected_revision),
          eq(agents.ownerEpoch, message.owner_epoch),
        ),
      )
      .returning({ id: agents.id });
    if (!changed.length) throw new ApiError("budget_revision_conflict", 409);
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      resourceId: agentId,
      action: "budget.updated",
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(message.owner),
      requestHash: hashSecret(canonical(message)),
    });
    await recordOwnerReceipt(tx, {
      tenantId: actor.tenantId,
      agentId,
      action: "budget_set",
      targetId: message.target_id,
      ownerEpoch: message.owner_epoch,
      message,
      proof,
      verification,
      original,
    });
    const result = await readBudgetFor(actor.tenantId, agentId, tx);
    await onCommit?.(tx, result);
    return result;
  });
}

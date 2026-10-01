import {
  agents,
  operations,
  ownerIntents,
  type Tx,
  walletPolicies,
} from "@near-intents-agent-api/database";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import { ApiError } from "../../shared/errors.js";
import { commitOwnerIntent } from "../intents/commit-service.js";
import { lockOperation } from "../operations/repository.js";
import { redactOperationResult } from "../operations/result-projection.js";

/** One process claims owner-signed OutLayer policy submission. */
export async function claimPreparedWalletPolicy(
  tenantId: string,
  agentId: string,
  id: string,
  result: unknown,
) {
  return getDatabase().transaction(async (tx) => {
    // Same lock as artifact delivery/finalization: authorization becomes visible before dispatch.
    await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
      .for("update");
    const operation = await lockOperation(tx, tenantId, agentId, id);
    if (
      operation?.status !== "pending" ||
      (operation.result as { status?: string })?.status !== "pending_wallet_signature"
    )
      return false;
    const [intent] = await tx
      .select()
      .from(ownerIntents)
      .where(and(eq(ownerIntents.tenantId, tenantId), eq(ownerIntents.operationId, id)))
      .for("update");
    if (intent?.state === "pending_signature")
      await commitOwnerIntent(tx, tenantId, intent.id, null, "submitted");
    else if (intent && intent.state !== "submitted") throw new ApiError("intent_not_pending", 409);
    await authorizePolicyDraft(
      tx,
      tenantId,
      agentId,
      (operation.result as { policy_id: string }).policy_id,
    );
    await tx
      .update(operations)
      .set({
        status: "uncertain",
        result: redactOperationResult(result, "policy"),
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(operations.tenantId, tenantId),
          eq(operations.agentId, agentId),
          eq(operations.id, id),
        ),
      );
    return true;
  });
}

async function authorizePolicyDraft(tx: Tx, tenantId: string, agentId: string, policyId: string) {
  const [policy] = await tx
    .select()
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.id, policyId),
      ),
    )
    .for("update");
  if (!policy || !["draft", "signed"].includes(policy.status))
    throw new ApiError("policy_not_pending", 409);
  if (policy.status === "draft") {
    const [latest] = await tx
      .select()
      .from(walletPolicies)
      .where(
        and(
          eq(walletPolicies.tenantId, tenantId),
          eq(walletPolicies.agentId, agentId),
          inArray(walletPolicies.status, ["signed", "applied", "failed"]),
        ),
      )
      .orderBy(desc(walletPolicies.version))
      .limit(1);
    if (latest?.status === "signed" || (latest?.version ?? 0) !== policy.version - 1)
      throw new ApiError("policy_revision_conflict", 409);
    await tx
      .update(walletPolicies)
      .set({ status: "signed" })
      .where(
        and(
          eq(walletPolicies.tenantId, tenantId),
          eq(walletPolicies.agentId, agentId),
          eq(walletPolicies.id, policyId),
        ),
      );
  }
}

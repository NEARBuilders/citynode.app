import { agents, auditEvents, operationArtifacts, type Tx } from "@near-intents-agent-api/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { DispatchEpochs } from "../operations/dispatch-fence.js";
import { type AuditProvenance, auditProvenance } from "./repository.js";

/**
 * Lifecycle state is authoritative in the agents row, not derived from the audit log. Audit
 * events are append-only forensic output; using them as active authorization state meant a
 * general-purpose audit retention job could change who may act.
 */
export async function lifecycleOf(tenantId: string, agentId: string) {
  const [agent] = await getDatabase()
    .select({ lifecycle: agents.lifecycle })
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .limit(1);
  return agent?.lifecycle ?? null;
}

export async function isArchived(tenantId: string, agentId: string) {
  return (await lifecycleOf(tenantId, agentId)) === "archived";
}

export async function isDeleted(tenantId: string, agentId: string) {
  return (await lifecycleOf(tenantId, agentId)) === "deleted";
}

async function eraseSigningArtifacts(tx: Tx, tenantId: string, agentId: string) {
  await tx
    .delete(operationArtifacts)
    .where(
      and(
        eq(operationArtifacts.tenantId, tenantId),
        eq(operationArtifacts.agentId, agentId),
        inArray(operationArtifacts.action, [
          "near_message",
          "evm_message",
          "evm_typed_data",
          "evm_transaction",
        ]),
      ),
    );
}

export async function applyControl(
  tenantId: string,
  agentId: string,
  accountId: string,
  previousKey: string,
  action: "archive" | "restore",
  previousCounter: number,
  provenance?: AuditProvenance,
  onCommit?: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  return getDatabase().transaction(async (tx) => {
    const updated = await tx
      .update(agents)
      .set({
        // Archive/restore is authoritative state and advances the lifecycle epoch, so
        // operations authorized before the change fail their dispatch fence.
        ...(action === "archive"
          ? {
              lifecycle: "archived" as const,
              archivedAt: new Date(),
              lifecycleEpoch: sql`${agents.lifecycleEpoch} + 1`,
            }
          : {}),
        ...(action === "restore"
          ? {
              lifecycle: "active" as const,
              archivedAt: null,
              lifecycleEpoch: sql`${agents.lifecycleEpoch} + 1`,
            }
          : {}),
      })
      .where(
        and(
          eq(agents.tenantId, tenantId),
          eq(agents.id, agentId),
          eq(agents.ownerAccountId, accountId),
          eq(agents.ownerPublicKey, previousKey),
          eq(agents.ownerCounter, previousCounter),
          eq(agents.lifecycle, action === "archive" ? "active" : "archived"),
        ),
      )
      .returning({ id: agents.id, ownerEpoch: agents.ownerEpoch });
    const updatedAgent = updated[0];
    if (!updatedAgent) return false;
    if (action === "archive") await eraseSigningArtifacts(tx, tenantId, agentId);
    await tx.insert(auditEvents).values({
      tenantId,
      agentId,
      action: `agent.${action}`,
      resourceId: previousKey,
      ...auditProvenance(provenance),
    });
    await onCommit?.(tx);
    return true;
  });
}

/**
 * Archives an agent inside the deletion reservation, so no agent request is admitted or
 * dispatched once the owner's deletion is accepted. The owner's authorization snapshot must still
 * be current. Returns the epochs the deletion itself commits under (an active agent moves to the
 * next lifecycle epoch; an archived agent keeps its epochs), or why it cannot be deleted.
 */
export async function archiveForDeletion(
  tx: Tx,
  tenantId: string,
  agentId: string,
  authorized: DispatchEpochs,
  provenance: AuditProvenance,
): Promise<
  | { epochs: DispatchEpochs }
  | { refusal: "agent_not_found" | "authorization_stale" | "agent_deleted" }
> {
  const [agent] = await tx
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .for("update");
  if (!agent) return { refusal: "agent_not_found" };
  if (
    agent.ownerEpoch !== authorized.ownerEpoch ||
    agent.policyEpoch !== authorized.policyEpoch ||
    agent.lifecycleEpoch !== authorized.lifecycleEpoch
  )
    return { refusal: "authorization_stale" };
  if (agent.lifecycle === "deleted") return { refusal: "agent_deleted" };
  if (agent.lifecycle === "archived") return { epochs: authorized };
  await tx
    .update(agents)
    .set({
      lifecycle: "archived",
      archivedAt: new Date(),
      lifecycleEpoch: sql`${agents.lifecycleEpoch} + 1`,
    })
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  await eraseSigningArtifacts(tx, tenantId, agentId);
  await tx.insert(auditEvents).values({
    tenantId,
    agentId,
    action: "agent.archive",
    resourceId: "delete",
    ...auditProvenance(provenance),
  });
  return { epochs: { ...authorized, lifecycleEpoch: authorized.lifecycleEpoch + 1 } };
}

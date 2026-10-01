import {
  agentGrantMessageSchema,
  executionRequestSchema,
  idSchema,
} from "@near-intents-agent-api/contracts";
import { agentGrants, operations } from "@near-intents-agent-api/database";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { findCustodyWallet } from "../wallet/repository.js";
import { findAgent } from "./repository.js";

const inventoryLimit = 100;

export const containmentStatusQuerySchema = z.strictObject({
  grants_after: idSchema.optional(),
  operations_after: idSchema.optional(),
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function operationDisposition(amountUnknown: boolean | null) {
  if (amountUnknown) return "effect_amount_unverifiable_reconcile";
  return "provider_reconciliation_required";
}

function grantInventoryEntry(
  grant: typeof agentGrants.$inferSelect,
  currentOwnerEpoch: number,
  now: number,
) {
  const findings: string[] = [];
  const signedMessage = agentGrantMessageSchema.safeParse(grant.ownerMessage);
  const grantRecordCurrent =
    grant.revokedAt === null &&
    grant.expiresAt.getTime() > now &&
    grant.ownerEpoch === currentOwnerEpoch &&
    signedMessage.success &&
    signedMessage.data.owner_epoch === grant.ownerEpoch;

  if (grant.revokedAt) findings.push("revoked");
  if (grant.expiresAt.getTime() <= now) findings.push("expired");
  if (grant.ownerEpoch !== currentOwnerEpoch) findings.push("owner_epoch_stale");
  if (!signedMessage.success || signedMessage.data.owner_epoch !== grant.ownerEpoch)
    findings.push("owner_message_unverifiable");
  if (grant.actions.includes("*")) findings.push("wildcard_actions");
  if (grant.actions.some((action) => ["sign:near_message", "sign:evm_message"].includes(action)))
    findings.push("identity_signing_capability");
  if (
    grant.actions.some(
      (action) =>
        action.startsWith("sign:") && !["sign:near_message", "sign:evm_message"].includes(action),
    )
  )
    findings.push("unsupported_signing_capability");

  return {
    grant_id: grant.id,
    label: grant.label,
    actions: grant.actions,
    owner_epoch: grant.ownerEpoch,
    issued_at: grant.issuedAt.toISOString(),
    expires_at: grant.expiresAt.toISOString(),
    revoked_at: grant.revokedAt?.toISOString() ?? null,
    grant_record_current: grantRecordCurrent,
    findings,
  };
}

function operationInventoryEntry(operation: typeof operations.$inferSelect) {
  const result = isRecord(operation.result) ? operation.result : {};
  const request = isRecord(result.request) ? result.request : null;
  const requestAction = request && typeof request.action === "string" ? request.action : null;
  const resultAction = typeof result.action === "string" ? result.action : null;
  const action = requestAction ?? resultAction;
  const parsedRequest = request ? executionRequestSchema.safeParse(request) : null;
  const amountUnknown = parsedRequest?.success ? true : null;
  const disposition = operationDisposition(amountUnknown);

  return {
    operation_id: operation.id,
    kind: operation.kind,
    status: operation.status,
    action,
    disposition,
    created_at: operation.createdAt.toISOString(),
    updated_at: operation.updatedAt.toISOString(),
  };
}

/** Read-only, tenant-scoped snapshot of API containment and existing authority candidates. */
export async function containmentStatus(
  actor: Actor,
  agentId: string,
  after: z.infer<typeof containmentStatusQuerySchema> = {},
) {
  const agent = await findAgent(actor.tenantId, agentId);
  if (!agent) throw new ApiError("agent_not_found", 404);

  const [wallet, grantRows, operationRows] = await Promise.all([
    findCustodyWallet(actor.tenantId, agentId),
    getDatabase()
      .select()
      .from(agentGrants)
      .where(
        and(
          eq(agentGrants.tenantId, actor.tenantId),
          eq(agentGrants.agentId, agentId),
          after.grants_after ? lt(agentGrants.id, after.grants_after) : undefined,
        ),
      )
      .orderBy(desc(agentGrants.id))
      .limit(inventoryLimit + 1),
    getDatabase()
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, actor.tenantId),
          eq(operations.agentId, agentId),
          inArray(operations.status, ["pending", "uncertain"]),
          after.operations_after ? lt(operations.id, after.operations_after) : undefined,
        ),
      )
      .orderBy(desc(operations.id))
      .limit(inventoryLimit + 1),
  ]);
  const now = Date.now();
  const grants = grantRows.slice(0, inventoryLimit);
  const pendingOperations = operationRows.slice(0, inventoryLimit);

  return {
    profile: "provider_policy" as const,
    generated_at: new Date(now).toISOString(),
    server_enforcement: {
      amount_unknown_actions: "provider_policy",
      execution_owner_review: "not_required",
    },
    provider_boundary: {
      enforcement: "unverified" as const,
      direct_provider_key_bypass: "unverified" as const,
    },
    wallet: wallet
      ? {
          wallet_id: wallet.providerWalletId || null,
          near_account_id: wallet.nearAccountId || null,
          evm_address: wallet.evmAddress || null,
          status: wallet.status,
        }
      : null,
    grants: {
      returned: grants.length,
      has_more: grantRows.length > inventoryLimit,
      next_cursor: grants.at(-1)?.id ?? null,
      items: grants.map((grant) => grantInventoryEntry(grant, agent.ownerEpoch, now)),
    },
    pending_operations: {
      returned: pendingOperations.length,
      has_more: operationRows.length > inventoryLimit,
      next_cursor: pendingOperations.at(-1)?.id ?? null,
      items: pendingOperations.map(operationInventoryEntry),
    },
  };
}

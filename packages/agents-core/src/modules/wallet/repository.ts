import type { Tx, WalletPolicyStatus } from "@near-intents-agent-api/database";
import {
  agents,
  auditEvents,
  custodyWallets,
  operationArtifacts,
  walletPolicies,
} from "@near-intents-agent-api/database";
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { SealedSecret } from "../../shared/secrets.js";

export type CustodyWalletRecord = typeof custodyWallets.$inferSelect;

export async function findCustodyWallet(tenantId: string, agentId: string) {
  return (
    await getDatabase()
      .select()
      .from(custodyWallets)
      .where(and(eq(custodyWallets.tenantId, tenantId), eq(custodyWallets.agentId, agentId)))
  )[0];
}

export async function insertProvisioningWallet(input: {
  id: string;
  tenantId: string;
  agentId: string;
  credential: SealedSecret;
}) {
  return (
    await getDatabase()
      .insert(custodyWallets)
      .values({
        id: input.id,
        tenantId: input.tenantId,
        agentId: input.agentId,
        providerWalletId: "",
        nearAccountId: "",
        evmAddress: "",
        credentialCiphertext: input.credential.ciphertext,
        credentialNonce: input.credential.nonce,
        credentialKeyId: input.credential.keyId,
        status: "provisioning",
      })
      .onConflictDoNothing()
      .returning({ id: custodyWallets.id })
  )[0];
}

export async function activateCustodyWallet(input: {
  id: string;
  tenantId: string;
  providerWalletId: string;
  nearAccountId: string;
  evmAddress: string;
  credential: SealedSecret;
}) {
  await getDatabase().transaction(async (tx) => {
    await tx
      .update(custodyWallets)
      .set({
        providerWalletId: input.providerWalletId,
        nearAccountId: input.nearAccountId,
        evmAddress: input.evmAddress,
        credentialCiphertext: input.credential.ciphertext,
        credentialNonce: input.credential.nonce,
        credentialKeyId: input.credential.keyId,
        status: "active",
        failureReason: null,
      })
      .where(eq(custodyWallets.id, input.id));
    await tx.insert(auditEvents).values({
      tenantId: input.tenantId,
      action: "wallet.provisioned",
      resourceId: input.providerWalletId,
    });
  });
}

export async function failCustodyWallet(id: string) {
  await getDatabase()
    .update(custodyWallets)
    .set({ status: "failed", failureReason: "wallet_provisioning_failed" })
    .where(eq(custodyWallets.id, id));
}

export async function markCustodyWalletDeletedInTransaction(
  tx: Tx,
  tenantId: string,
  agentId: string,
  walletId: string,
) {
  // The custody credential is never needed again; erasing it retires the wallet even where the
  // provider had nothing on chain to delete.
  await tx
    .update(custodyWallets)
    .set({ status: "deleted", failureReason: null, credentialCiphertext: "", credentialNonce: "" })
    .where(
      and(
        eq(custodyWallets.tenantId, tenantId),
        eq(custodyWallets.agentId, agentId),
        eq(custodyWallets.providerWalletId, walletId),
      ),
    );
  // Deletion is authoritative state on the agent, not an inference from this audit row.
  await tx
    .update(agents)
    .set({ lifecycle: "deleted", deletedAt: new Date() })
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  await tx
    .insert(auditEvents)
    .values({ tenantId, agentId, action: "agent.deleted", resourceId: walletId });
}

type EffectivePolicy = Omit<typeof walletPolicies.$inferSelect, "status"> & {
  status: "signed" | "applied" | "failed";
};

export async function latestPolicy(
  tenantId: string,
  agentId: string,
): Promise<EffectivePolicy | undefined> {
  return (
    await getDatabase()
      .select()
      .from(walletPolicies)
      .where(
        and(
          eq(walletPolicies.tenantId, tenantId),
          eq(walletPolicies.agentId, agentId),
          notInArray(walletPolicies.status, ["draft", "discarded"]),
        ),
      )
      .orderBy(desc(walletPolicies.version))
      .limit(1)
  )[0] as EffectivePolicy | undefined;
}

export async function latestPolicyVersion(walletId: string) {
  return (
    await getDatabase()
      .select({ version: walletPolicies.version })
      .from(walletPolicies)
      .where(
        and(
          eq(walletPolicies.walletId, walletId),
          notInArray(walletPolicies.status, ["draft", "discarded"]),
        ),
      )
      .orderBy(desc(walletPolicies.version))
      .limit(1)
  )[0]?.version;
}

export async function insertWalletPolicy(input: {
  id: string;
  tenantId: string;
  agentId: string;
  walletId: string;
  version: number;
  policyHash: string;
  encryptedData: string;
  signatureHex: string;
  publicKeyHex: string;
  rules: unknown;
  status: WalletPolicyStatus;
}) {
  await getDatabase().transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.tenantId, input.tenantId), eq(agents.id, input.agentId)))
      .for("update");
    if (!agent) throw new Error("wallet policy agent not found");
    await tx.insert(walletPolicies).values(input);
  });
}

/** Row-locks one revision in the caller's transaction. */
export async function lockPolicyRecord(tx: Tx, tenantId: string, agentId: string, id: string) {
  const [policy] = await tx
    .select({ id: walletPolicies.id, rules: walletPolicies.rules, status: walletPolicies.status })
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.id, id),
      ),
    )
    .for("update");
  return policy;
}

/** The newest revision of an agent's policy, read inside the caller's transaction. */
export async function latestPolicyIdInTransaction(tx: Tx, tenantId: string, agentId: string) {
  const [latest] = await tx
    .select({ id: walletPolicies.id })
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        notInArray(walletPolicies.status, ["draft", "discarded"]),
      ),
    )
    .orderBy(desc(walletPolicies.version))
    .limit(1);
  return latest?.id;
}

/**
 * Fences work authorized against the previous provider policy, inside the caller's transaction,
 * which holds the agent row lock: every operation admitted before is stale and must not dispatch.
 * When the policy in question freezes the wallet, undelivered signing artifacts are dropped too.
 */
export async function advancePolicyEpoch(
  tx: Tx,
  tenantId: string,
  agentId: string,
  rules: unknown,
) {
  await tx
    .update(agents)
    .set({ policyEpoch: sql`${agents.policyEpoch} + 1` })
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  if (
    rules !== null &&
    typeof rules === "object" &&
    (rules as { frozen?: unknown }).frozen === true
  )
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

/**
 * Moves one signed revision to applied inside the caller's transaction, which holds the agent row
 * lock. Only the `signed → applied` transition advances the policy epoch, records `policy.applied`
 * and, for a freeze, drops undelivered signing artifacts; returns whether it happened, so a repeated
 * application is a no-op instead of a second epoch change.
 */
export async function applyPolicyRecord(
  tx: Tx,
  tenantId: string,
  agentId: string,
  id: string,
  transactionHash: string | null,
): Promise<boolean> {
  const applied = await tx
    .update(walletPolicies)
    .set({
      appliedAt: new Date(),
      failureReason: null,
      status: "applied",
      transactionHash,
    })
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.id, id),
        eq(walletPolicies.status, "signed"),
      ),
    )
    .returning({ rules: walletPolicies.rules });
  const policy = applied[0];
  if (!policy) return false;
  await advancePolicyEpoch(tx, tenantId, agentId, policy.rules);
  await tx.insert(auditEvents).values({
    tenantId,
    agentId,
    action: "policy.applied",
    resourceId: id,
  });
  return true;
}

/**
 * Fails one still-signed revision inside the caller's transaction. An applied or already failed
 * revision is left as it is; returns whether this call failed it.
 */
export async function failPolicyRecord(
  tx: Tx,
  tenantId: string,
  agentId: string,
  id: string,
  reason: string,
): Promise<boolean> {
  const failed = await tx
    .update(walletPolicies)
    .set({
      failureReason: reason.slice(0, 200),
      status: sql`case when ${walletPolicies.status} = 'draft' then 'discarded' else 'failed' end`,
    })
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.id, id),
        inArray(walletPolicies.status, ["draft", "signed"]),
      ),
    )
    .returning({ id: walletPolicies.id });
  return failed.length === 1;
}

/** Fails a still-signed revision that has no operation to settle with it. */
export async function markPolicyFailed(
  tenantId: string,
  agentId: string,
  id: string,
  reason: string,
) {
  await getDatabase().transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
      .for("update");
    if (!agent) throw new Error("wallet policy agent not found");
    await failPolicyRecord(tx, tenantId, agentId, id, reason);
  });
}

export async function latestAppliedPolicy(tenantId: string, agentId: string) {
  return (
    await getDatabase()
      .select()
      .from(walletPolicies)
      .where(
        and(
          eq(walletPolicies.tenantId, tenantId),
          eq(walletPolicies.agentId, agentId),
          eq(walletPolicies.status, "applied"),
        ),
      )
      .orderBy(desc(walletPolicies.version))
      .limit(1)
  )[0];
}

export async function listPolicyVersions(
  tenantId: string,
  agentId: string,
  limit: number,
  beforeRevision?: number,
) {
  return (await getDatabase()
    .select()
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        notInArray(walletPolicies.status, ["draft", "discarded"]),
        beforeRevision === undefined ? undefined : lt(walletPolicies.version, beforeRevision),
      ),
    )
    .orderBy(desc(walletPolicies.version))
    .limit(limit)) as EffectivePolicy[];
}

/** Audit record of a vote relayed to the provider; `voter` is the signing approver principal. */
export async function recordApprovalVote(input: {
  tenantId: string;
  agentId: string;
  approvalId: string;
  actorKeyId: string;
  voter: string;
  requestHash: string;
}) {
  await getDatabase().insert(auditEvents).values({
    tenantId: input.tenantId,
    agentId: input.agentId,
    action: "approval.voted",
    resourceId: input.approvalId,
    actorKeyId: input.actorKeyId,
    actorOwnerId: input.voter,
    requestHash: input.requestHash,
  });
}

/** Exact proposal lookup; never use this to decide execution authority. */
export async function findPolicyRecord(tenantId: string, agentId: string, id: string) {
  const [row] = await getDatabase()
    .select()
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.id, id),
      ),
    );
  return row;
}

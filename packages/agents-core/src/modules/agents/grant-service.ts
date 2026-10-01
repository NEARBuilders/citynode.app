import {
  type AgentGrantMessage,
  type AgentGrantRevocation,
  type AgentGrantView,
  type AgentGrantWrite,
  agentGrantMessageSchema,
  canonical,
  executionActionSchema,
  grantTokenPattern,
  historicalGrantMessageSchema,
} from "@near-intents-agent-api/contracts";
import { agentGrants, agents, auditEvents } from "@near-intents-agent-api/database";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getRuntime } from "../../config/runtime.js";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { consumeOwnerNonceInTransaction, issueOwnerNonce } from "../../shared/nonces.js";
import { ownerMessageExpired } from "../../shared/owner-message.js";
import { committedDelegatedOperations, type DispatchEpochs } from "../operations/dispatch-fence.js";
import type { GrantCheck } from "./grant-constraints.js";
import { grantRestatesOwnerMessage } from "./grant-integrity.js";
import {
  assertOwnerAdminCommand,
  ownerAdminCommandChallenge,
  ownerPrincipalId,
  verifyOwnerAdminCommand,
} from "./owner-admin-command.js";
import { verifyBoundOwner } from "./owner-authorization.js";
import { recordOwnerReceipt } from "./owner-receipts.js";
import { ownerMessageRecipient, requireBoundAgent, requireBoundOwnerAgent } from "./service.js";

export type GrantRecord = typeof agentGrants.$inferSelect;
/** The grant an admitted delegate action runs under, recorded in operation provenance. */
export type GrantAuthorizationDecision = {
  grantId: string;
  label: string;
  authorizationEpochs: DispatchEpochs;
};

/**
 * How a delegated request names its grant. Callers present the grant token; only an internal
 * resume of work the grant already admitted (a timelocked execution) names the grant by id.
 */
export type GrantSelector = { token: string | undefined } | { admittedGrantId: string };

/** How long an owner-issued grant may live. A harness credential must not be permanent. */
const maxGrantLifetimeMs = 90 * 24 * 60 * 60 * 1000;
/** Live grants one agent may hold at once: one per session, assistant or bot. */
export const maxLiveGrantsPerAgent = 50;

export function grantRecordView(record: GrantRecord): AgentGrantView {
  return {
    grant_id: record.id,
    agent_id: record.agentId,
    wallet_id: record.walletId,
    label: record.label,
    actions: record.actions,
    recipients: agentGrantMessageSchema.safeParse(record.ownerMessage).success
      ? record.recipients
      : [],
    signing_audiences: record.signingAudiences,
    issued_at: record.issuedAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    revoked_at: record.revokedAt?.toISOString() ?? null,
    revoked_reason: record.revokedReason ?? null,
    owner_epoch: record.ownerEpoch,
    owner_message: historicalGrantMessageSchema.parse(record.ownerMessage),
  };
}

/**
 * Every action a grant can delegate: the Intents executions and the two identity-signing
 * purposes. Approval votes need no grant; the approver's signature authorizes them. A signed grant
 * naming anything else would never authorize a request, so it is refused at issue instead of
 * silently doing nothing.
 */
const delegableActions = new Set<string>([
  "*",
  "sign:near_message",
  "sign:evm_message",
  ...executionActionSchema.options.filter((action) => action !== "delete"),
]);

export function assertGrantMessage(
  actor: Actor,
  message: AgentGrantMessage,
  agent: Awaited<ReturnType<typeof requireBoundAgent>>["agent"],
  walletId: string,
) {
  if (message.network !== getRuntime().network) throw new ApiError("owner_mismatch", 409);
  if (message.tenant_id !== actor.tenantId) throw new ApiError("owner_mismatch", 409);
  if (message.agent_id !== agent.id) throw new ApiError("owner_mismatch", 409);
  if (message.wallet_id !== walletId) throw new ApiError("wallet_mismatch", 409);
  if (message.owner_epoch !== agent.ownerEpoch) throw new ApiError("owner_epoch_invalid", 409);
  const now = Date.now();
  if (
    ownerMessageExpired(message, now) ||
    message.expires_at_ms <= message.issued_at_ms ||
    message.expires_at_ms - now > maxGrantLifetimeMs
  )
    throw new ApiError("grant_expiry_invalid", 409);
  // Owner-only administrative actions can never be delegated to an agent grant.
  const ownerOnlyActions = ["add_key", "unfreeze", "delete"];
  if (message.actions.some((action) => ownerOnlyActions.includes(action)))
    throw new ApiError("grant_action_forbidden", 409);
  if (message.actions.some((action) => !delegableActions.has(action)))
    throw new ApiError("grant_action_unknown", 400);
}

/**
 * Installs one owner-signed grant. It is independent of every other grant on the agent and of
 * the API key that submitted it: only its token can use it, and nothing else is revoked or fenced.
 */
export async function issueAgentGrant(
  actor: Actor,
  agentId: string,
  input: AgentGrantWrite,
  onCommit?: CommitEffect<AgentGrantView>,
  original?: unknown,
) {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  const message = input.message;
  assertGrantMessage(actor, message, agent, wallet.providerWalletId);
  const verification = await verifyBoundOwner(agent, message, input.proof);

  // The owner nonce is single-use, so it names exactly one issuance.
  const grantId = hashSecret(
    canonical({ tenant: actor.tenantId, agent: agentId, nonce: message.nonce }),
  );
  const record = await getDatabase().transaction(async (tx) => {
    // The agent row serializes issuance for the live-grant cap, and an owner transition that
    // committed first makes this proof stale.
    const [locked] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, actor.tenantId),
          eq(agents.id, agentId),
          eq(agents.ownerEpoch, message.owner_epoch),
        ),
      )
      .for("update");
    if (!locked) throw new ApiError("owner_epoch_invalid", 409);
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, message.nonce);
    const [live] = await tx
      .select({ count: count() })
      .from(agentGrants)
      .where(
        and(
          eq(agentGrants.tenantId, actor.tenantId),
          eq(agentGrants.agentId, agentId),
          isNull(agentGrants.revokedAt),
          gt(agentGrants.expiresAt, sql`now()`),
        ),
      );
    if ((live?.count ?? 0) >= maxLiveGrantsPerAgent) throw new ApiError("grant_limit_reached", 409);
    const [row] = await tx
      .insert(agentGrants)
      .values({
        id: grantId,
        tenantId: actor.tenantId,
        agentId,
        walletId: wallet.providerWalletId,
        label: message.label,
        credentialHash: message.credential,
        actions: message.actions,
        recipients: message.recipients,
        signingAudiences: message.signing_audiences,
        ownerEpoch: message.owner_epoch,
        issuedAt: new Date(message.issued_at_ms),
        expiresAt: new Date(message.expires_at_ms),
        ownerMessage: message,
      })
      .onConflictDoNothing()
      .returning();
    await recordOwnerReceipt(tx, {
      tenantId: actor.tenantId,
      agentId,
      action: "grant_issue",
      targetId: grantId,
      ownerEpoch: message.owner_epoch,
      message,
      proof: input.proof,
      verification,
      original,
    });
    // A token commits to one grant only; reusing it would make the token ambiguous.
    if (!row) throw new ApiError("grant_credential_reused", 409);
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      action: "agent.grant_issued",
      resourceId: grantId,
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(message.owner),
      grantId,
      ownerEpoch: message.owner_epoch,
      requestHash: hashSecret(canonical(message)),
    });
    await onCommit?.(tx, grantRecordView(row));
    return row;
  });
  return grantRecordView(record);
}

export async function grantRevocationChallenge(actor: Actor, agentId: string, grantId: string) {
  const agent = await requireBoundOwnerAgent(actor.tenantId, agentId);
  const [grant] = await getDatabase()
    .select({ id: agentGrants.id })
    .from(agentGrants)
    .where(
      and(
        eq(agentGrants.tenantId, actor.tenantId),
        eq(agentGrants.agentId, agentId),
        eq(agentGrants.id, grantId),
        eq(agentGrants.ownerEpoch, agent.ownerEpoch),
        isNull(agentGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!grant) throw new ApiError("grant_not_found", 404);
  return ownerAdminCommandChallenge(actor, agent, "revoke_grant", grantId);
}

/** Revokes one grant only under a fresh command signed by the agent's current owner. */
export async function revokeAgentGrant(
  actor: Actor,
  agentId: string,
  grantId: string,
  input: AgentGrantRevocation,
  onCommit?: CommitEffect<{
    revoked: boolean;
    committed_operation_ids: string[];
    committed_truncated: boolean;
  }>,
  original?: unknown,
) {
  const agent = await requireBoundOwnerAgent(actor.tenantId, agentId);
  const { message, proof } = input;
  assertOwnerAdminCommand(actor, agent, "revoke_grant", grantId, message);
  const verification = await verifyOwnerAdminCommand(agent, message, proof);
  // Revoking the grant row waits for every in-flight dispatch commitment that share-locks it.
  // Later commitments are refused; earlier ones are reported. Other grants are untouched.
  const committed = await getDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, actor.tenantId),
          eq(agents.id, agentId),
          eq(agents.ownerEpoch, message.owner_epoch),
        ),
      )
      .for("share");
    if (!current) throw new ApiError("owner_command_stale", 409);
    const rows = await tx
      .update(agentGrants)
      .set({ revokedAt: new Date(), revokedReason: "owner_revoked" })
      .where(
        and(
          eq(agentGrants.tenantId, actor.tenantId),
          eq(agentGrants.agentId, agentId),
          eq(agentGrants.id, grantId),
          eq(agentGrants.ownerEpoch, message.owner_epoch),
          isNull(agentGrants.revokedAt),
        ),
      )
      .returning({ id: agentGrants.id });
    if (rows.length !== 1) throw new ApiError("grant_not_found", 404);
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, message.nonce);
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      action: "agent.grant_revoked",
      resourceId: grantId,
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(message.owner),
      grantId,
      ownerEpoch: message.owner_epoch,
      requestHash: hashSecret(canonical(message)),
    });
    await recordOwnerReceipt(tx, {
      tenantId: actor.tenantId,
      agentId,
      action: "grant_revoke",
      targetId: grantId,
      ownerEpoch: message.owner_epoch,
      message,
      proof,
      verification,
      original,
    });
    const { ids, truncated } = await committedDelegatedOperations(tx, actor.tenantId, {
      agentId,
      grantId,
    });
    const report = { committed_operation_ids: ids, committed_truncated: truncated };
    await onCommit?.(tx, { revoked: true, ...report });
    return report;
  });
  return { revoked: true, ...committed };
}

export async function listAgentGrants(actor: Actor, agentId: string): Promise<AgentGrantView[]> {
  await requireBoundAgent(actor, agentId);
  const rows = await getDatabase()
    .select()
    .from(agentGrants)
    .where(and(eq(agentGrants.tenantId, actor.tenantId), eq(agentGrants.agentId, agentId)))
    .orderBy(desc(agentGrants.createdAt));
  return rows.map(grantRecordView);
}

/** A grant ceremony challenge: the owner signs a fresh nonce under the current owner epoch. */
export async function grantChallenge(actor: Actor, agentId: string) {
  const { agent } = await requireBoundAgent(actor, agentId);
  return {
    nonce: await issueOwnerNonce(actor.tenantId, agentId),
    recipient: ownerMessageRecipient(),
    owner_epoch: agent.ownerEpoch,
  };
}

/**
 * The live grant a selector names, with the epochs admission is recorded under. A token that is
 * malformed, unknown, revoked, expired or bound to another agent resolves to nothing, the same way.
 */
async function liveGrantSnapshot(
  tenantId: string,
  agentId: string,
  selector: GrantSelector,
): Promise<{ grant: GrantRecord; authorizationEpochs: DispatchEpochs } | null> {
  if ("token" in selector && !(selector.token && grantTokenPattern.test(selector.token)))
    return null;
  const [row] = await getDatabase()
    .select({
      grant: agentGrants,
      ownerEpoch: agents.ownerEpoch,
      policyEpoch: agents.policyEpoch,
      lifecycleEpoch: agents.lifecycleEpoch,
    })
    .from(agentGrants)
    .innerJoin(
      agents,
      and(eq(agents.tenantId, agentGrants.tenantId), eq(agents.id, agentGrants.agentId)),
    )
    .where(
      and(
        eq(agentGrants.tenantId, tenantId),
        eq(agentGrants.agentId, agentId),
        "token" in selector
          ? eq(agentGrants.credentialHash, grantCredentialHash(selector.token ?? ""))
          : eq(agentGrants.id, selector.admittedGrantId),
        eq(agentGrants.ownerEpoch, agents.ownerEpoch),
        isNull(agentGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!row || row.grant.expiresAt.getTime() <= Date.now()) return null;
  if (!grantRestatesOwnerMessage(row.grant)) return null;
  return {
    grant: row.grant,
    authorizationEpochs: {
      ownerEpoch: row.ownerEpoch,
      policyEpoch: row.policyEpoch,
      lifecycleEpoch: row.lifecycleEpoch,
    },
  };
}

/** The stored commitment of a grant token: SHA-256 hex of its UTF-8 bytes. */
export function grantCredentialHash(token: string): string {
  return hashSecret(token);
}

export type GrantAuthorizationInput = {
  actor: Actor;
  agentId: string;
  grant: GrantSelector;
  action: string;
  /**
   * Action-specific destinations and spend, extracted by `grant-constraints.ts`. Recipient allowlists are checked locally; amounts remain provider-policy inputs.
   */
  check: GrantCheck;
  /** Provider wallet the grant is bound to, so a wallet swap invalidates the delegation. */
  walletId: string;
};

function assertActionAllowed(grant: AgentGrantView, action: string): void {
  // A wildcard grant is useful for typed execution, but it cannot express which detached
  // signature purpose the owner approved. Signing therefore needs its literal action entry.
  if (action.startsWith("sign:")) {
    if (!grant.actions.includes(action)) throw new ApiError("grant_action_denied", 403);
    return;
  }
  if (!grant.actions.includes("*") && !grant.actions.includes(action))
    throw new ApiError("grant_action_denied", 403);
}

function assertSigningAudienceExplicit(grant: AgentGrantView, action: string): void {
  if (action.startsWith("sign:") && grant.signing_audiences.length === 0)
    throw new ApiError("grant_signing_audience_required", 403);
}

/** Empty grants allow only self-directed effects; every named destination must be listed. */
function assertRecipientsAllowed(grant: AgentGrantView, check: GrantCheck): void {
  if (check.recipients.length === 0 && !check.selfDirected && check.audience === undefined)
    throw new ApiError("grant_recipient_required", 403);
  if (check.audience !== undefined) {
    if (!grant.signing_audiences.includes(check.audience))
      throw new ApiError("grant_recipient_denied", 403);
    return;
  }
  for (const recipient of check.recipients)
    if (!grant.recipients.some((allowed) => canonical(allowed) === canonical(recipient)))
      throw new ApiError("grant_recipient_denied", 403);
}

/**
 * Fails closed on an action the grant does not list, an unverifiable destination, a recipient the
 * grant does not list, or a grant that binds a different custody wallet. Spending limits belong
 * to the owner-configured provider policy.
 */
function assertGrantAllowsAction(grant: AgentGrantView, input: GrantAuthorizationInput): void {
  assertActionAllowed(grant, input.action);
  assertSigningAudienceExplicit(grant, input.action);
  if (grant.wallet_id !== input.walletId) throw new ApiError("grant_wallet_mismatch", 409);
  assertRecipientsAllowed(grant, input.check);
}

/** Enforces the owner grant the request names for one delegate action. */
export async function authorizeDelegatedAction(
  input: GrantAuthorizationInput,
): Promise<GrantAuthorizationDecision> {
  const snapshot = await liveGrantSnapshot(input.actor.tenantId, input.agentId, input.grant);
  if (!snapshot) throw new ApiError("agent_grant_required", 403);
  const { grant, authorizationEpochs } = snapshot;
  assertGrantAllowsAction(grantRecordView(grant), input);
  return { grantId: grant.id, label: grant.label, authorizationEpochs };
}

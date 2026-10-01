import type {
  GrantDestination,
  OwnerNear,
  OwnerWallet,
  PartnerQuotaProfile,
} from "@near-intents-agent-api/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export type OperationKind = "sign" | "execute" | "relay" | "policy";
export type OperationStatus = "pending" | "completed" | "uncertain" | "failed";
export type CustodyWalletStatus = "provisioning" | "active" | "failed" | "deleted";
export type WalletPolicyStatus = "draft" | "discarded" | "signed" | "applied" | "failed";
export type SponsorReservationState = "reserved" | "committed" | "released";
export type SpendChargeState = "committed" | "released";
export type AgentLifecycle = "pending" | "active" | "archived" | "deleted" | "abandoned";
export type OwnerIntentState = "pending_signature" | "submitted" | "completed" | "failed";

export const tenants = pgTable("tenants", {
  quotaProfile: jsonb("quota_profile").$type<PartnerQuotaProfile>().notNull().default({}),
  quotaRevision: integer("quota_revision").notNull().default(0),
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_keys_tenant").on(table.tenantId)],
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    externalUserId: text("external_user_id"),
    ownerIdentity: jsonb("owner_identity").$type<OwnerWallet>(),
    ownerNear: jsonb("owner_near").$type<OwnerNear>(),
    ownerCounter: bigint("owner_counter", { mode: "number" }).notNull().default(0),
    ownerAccountId: text("owner_account_id"),
    ownerPublicKey: text("owner_public_key"),
    /**
     * Monotonic epochs. One dispatch fence compares the epochs an operation was authorized under
     * with the epochs at its commitment point, so a policy update, owner change or lifecycle
     * change between admission and dispatch invalidates the pending authorization. They only ever
     * increase and are never reset after an error.
     */
    ownerEpoch: bigint("owner_epoch", { mode: "number" }).notNull().default(1),
    timelockDelaySeconds: integer("timelock_delay_seconds").notNull().default(0),
    timelockRevision: integer("timelock_revision").notNull().default(0),
    /** Owner-signed USD spend caps in cents over rolling 24 h / 7 d / 30 d; null is uncapped. */
    budgetDailyCents: bigint("budget_daily_cents", { mode: "number" }),
    budgetWeeklyCents: bigint("budget_weekly_cents", { mode: "number" }),
    budgetMonthlyCents: bigint("budget_monthly_cents", { mode: "number" }),
    budgetRevision: integer("budget_revision").notNull().default(0),
    policyEpoch: bigint("policy_epoch", { mode: "number" }).notNull().default(1),
    lifecycleEpoch: bigint("lifecycle_epoch", { mode: "number" }).notNull().default(1),
    /**
     * Authoritative lifecycle state. Deriving archived/deleted from the audit log conflated
     * append-only forensic output with active authorization state; these columns are the state,
     * and the audit rows are the record of how it changed.
     */
    /**
     * `pending` until the owner's onboarding request finalizes on chain; only then are the owner
     * columns written. `abandoned` agents never received a valid onboarding signature.
     */
    lifecycle: text("lifecycle").$type<AgentLifecycle>().notNull().default("pending"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    // Cursor pagination orders by (created_at, id) per tenant; without this it sorts the tenant.
    index("agents_tenant_created").on(table.tenantId, table.createdAt.desc(), table.id.desc()),
    index("agents_external_user").on(table.tenantId, table.externalUserId),
    check(
      "agents_lifecycle_check",
      sql`${table.lifecycle} IN ('pending', 'active', 'archived', 'deleted', 'abandoned')`,
    ),
  ],
);

export const custodyWallets = pgTable(
  "custody_wallets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    providerWalletId: text("provider_wallet_id").notNull(),
    nearAccountId: text("near_account_id").notNull(),
    evmAddress: text("evm_address").notNull(),
    credentialCiphertext: text("credential_ciphertext").notNull(),
    credentialNonce: text("credential_nonce").notNull(),
    credentialKeyId: text("credential_key_id").notNull(),
    status: text("status").$type<CustodyWalletStatus>().notNull(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    unique("custody_wallets_agent").on(table.tenantId, table.agentId),
    check(
      "custody_wallets_status_check",
      sql`${table.status} IN ('provisioning', 'active', 'failed', 'deleted')`,
    ),
  ],
);

export const walletPolicies = pgTable(
  "wallet_policies",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    version: integer("version").notNull(),
    policyHash: text("policy_hash").notNull(),
    encryptedData: text("encrypted_data").notNull(),
    signatureHex: text("signature_hex").notNull(),
    publicKeyHex: text("public_key_hex").notNull(),
    rules: jsonb("rules").$type<unknown>().notNull(),
    status: text("status").$type<WalletPolicyStatus>().notNull(),
    transactionHash: text("transaction_hash"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    uniqueIndex("wallet_policies_version")
      .on(table.walletId, table.version)
      .where(sql`${table.status} NOT IN ('draft', 'discarded')`),
    // `latestPolicy`/`latestAppliedPolicy` sort by version within one agent; without this the
    // dashboard and every pre-flight check scans the tenant's policy history.
    index("wallet_policies_agent_version").on(table.tenantId, table.agentId, table.version.desc()),
    check(
      "wallet_policies_status_check",
      sql`${table.status} IN ('draft', 'discarded', 'signed', 'applied', 'failed')`,
    ),
  ],
);

export const operations = pgTable(
  "operations",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    actorKeyId: text("actor_key_id"),
    kind: text("kind").$type<OperationKind>().notNull(),
    /**
     * What the operation does, recorded at admission: the execution action (`swap`, `withdraw`,
     * …), `sign:<purpose>`, `relay`, `policy`, `onboarding` or `delete`. Status reads type a
     * correlation id from it before any provider result exists.
     */
    action: text("action"),
    requestHash: text("request_hash").notNull(),
    status: text("status").$type<OperationStatus>().notNull(),
    /**
     * The epoch snapshot the operation was authorized under. The fence compares it with the
     * agent's current epochs at the commitment point; a mismatch means the authorization is
     * stale and dispatch must fail closed.
     */
    authorizedOwnerEpoch: bigint("authorized_owner_epoch", { mode: "number" }),
    authorizedPolicyEpoch: bigint("authorized_policy_epoch", { mode: "number" }),
    authorizedLifecycleEpoch: bigint("authorized_lifecycle_epoch", { mode: "number" }),
    /**
     * Owner grant a delegated operation was admitted under. The fence re-validates this exact
     * grant and the key that sent the request at dispatch, so revoking either or expiry after
     * admission fails closed. Null for owner-signed operations, whose authority is the owner
     * signature rather than a delegation.
     */
    authorizedGrantId: text("authorized_grant_id"),
    /** The grant's owner-signed label at admission, for attribution in status and history. */
    authorizedGrantLabel: text("authorized_grant_label"),
    /**
     * When the operation was first claimed for dispatch. From here it reads `uncertain`, but local
     * preparation (readiness reads, gas sponsorship) still runs before any provider write.
     */
    dispatchClaimedAt: timestamp("dispatch_claimed_at", { withTimezone: true }),
    /**
     * The latest dispatch commitment: the serialized authority check taken immediately before a
     * provider write. Revocation serializes against it, so it is the point that decides whether a
     * revocation or a dispatch won. A claimed operation without it never reached a provider.
     * Provider idempotency retention is measured from here.
     */
    dispatchCommittedAt: timestamp("dispatch_committed_at", { withTimezone: true }),
    result: jsonb("result").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    // Dashboard counts and pending-deletion lookups filter by tenant + status; policy
    // reconciliation looks up one operation by result->>'policy_id'.
    index("operations_tenant_status").on(table.tenantId, table.status, table.createdAt.desc()),
    index("operations_agent_created").on(table.tenantId, table.agentId, table.createdAt.desc()),
    index("operations_actor_created").on(table.tenantId, table.actorKeyId, table.createdAt.desc()),
    // Status reads resolve a correlation id without its agent.
    index("operations_tenant_id").on(table.tenantId, table.id),
    check(
      "operations_status_check",
      sql`${table.status} IN ('pending', 'completed', 'uncertain', 'failed')`,
    ),
    check("operations_kind_check", sql`${table.kind} IN ('sign', 'execute', 'relay', 'policy')`),
    check(
      "operations_sign_result_safe_check",
      sql`${table.kind} <> 'sign' OR ${table.result} IS NULL OR (
        jsonb_typeof(${table.result}) = 'object'
        AND ${table.result}->'redacted' = 'true'::jsonb
        AND ${table.result}->'artifact_redacted' = 'true'::jsonb
        AND jsonb_typeof(${table.result}->'status') = 'string'
        AND ${table.result}->>'status' IN (
          'pending', 'pending_approval', 'pending_deposit',
          'pending_wallet_signature', 'processing', 'approved', 'success', 'partially_failed',
          'failed', 'refunded', 'rejected', 'expired', 'cancelled', 'needs_review', 'unknown',
          'completed', 'uncertain', 'dispatching', 'submitted', 'applied'
        )
        AND (${table.result} - ARRAY['redacted', 'artifact_redacted', 'status', 'failure_code', 'provider_request_id']) = '{}'::jsonb
        AND (NOT (${table.result} ? 'failure_code') OR (
          jsonb_typeof(${table.result}->'failure_code') = 'string'
          AND char_length(${table.result}->>'failure_code') <= 256
        ))
        AND (NOT (${table.result} ? 'provider_request_id') OR (
          ${table.result}->'provider_request_id' = 'null'::jsonb OR (
            jsonb_typeof(${table.result}->'provider_request_id') = 'string'
            AND char_length(${table.result}->>'provider_request_id') <= 128
          )
        ))
      )`,
    ),
  ],
);

/** Compact, permanent admission record prevents an old idempotency key from dispatching again. */
export const operationTombstones = pgTable(
  "operation_tombstones",
  {
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    id: text("id").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.agentId, table.id] })],
);

/**
 * Short-lived operation artifact channel for signatures. Payloads
 * stay encrypted and out of generic operation results; ACK atomically clears ciphertext.
 */
export const operationArtifacts = pgTable(
  "operation_artifacts",
  {
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    operationId: text("operation_id").notNull(),
    /** Only a request carrying this grant's token (or the owner) can read the signature. */
    grantId: text("grant_id").notNull(),
    ownerEpoch: bigint("owner_epoch", { mode: "number" }).notNull(),
    action: text("action").notNull(),
    ciphertext: text("ciphertext"),
    keyId: text("key_id"),
    nonce: text("nonce"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentId, table.operationId] }),
    foreignKey({
      columns: [table.tenantId, table.agentId, table.operationId],
      foreignColumns: [operations.tenantId, operations.agentId, operations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.agentId, table.grantId],
      foreignColumns: [agentGrants.tenantId, agentGrants.agentId, agentGrants.id],
    }).onDelete("cascade"),
    index("operation_artifacts_expires").on(table.expiresAt),
    check(
      "operation_artifacts_action_check",
      sql`${table.action} IN ('near_message', 'evm_message', 'evm_typed_data', 'evm_transaction')`,
    ),
    check(
      "operation_artifacts_payload_state_check",
      sql`(${table.consumedAt} IS NULL AND ${table.ciphertext} IS NOT NULL AND ${table.keyId} IS NOT NULL AND ${table.nonce} IS NOT NULL) OR (${table.consumedAt} IS NOT NULL AND ${table.ciphertext} IS NULL AND ${table.keyId} IS NULL AND ${table.nonce} IS NULL)`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    agentId: text("agent_id"),
    action: text("action").notNull(),
    resourceId: text("resource_id").notNull(),
    /**
     * Provenance: who acted, under which delegation, against which versions, and what exact
     * authorization was presented. Without this an incident review can only see that something
     * happened, not whether the owner's intent covered it. Raw secrets are never recorded here.
     */
    actorKeyId: text("actor_key_id"),
    /** Verified wallet/passkey principal that authorized owner-exclusive actions. */
    actorOwnerId: text("actor_owner_id"),
    grantId: text("grant_id"),
    ownerEpoch: bigint("owner_epoch", { mode: "number" }),
    policyEpoch: bigint("policy_epoch", { mode: "number" }),
    lifecycleEpoch: bigint("lifecycle_epoch", { mode: "number" }),
    /** Canonical hash of the exact request or owner authorization this event concerns. */
    requestHash: text("request_hash"),
    /** Provider transaction/request identity, recorded independently of application state. */
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_tenant").on(table.tenantId, table.id),
    index("audit_events_actor").on(table.tenantId, table.actorKeyId, table.createdAt.desc()),
    index("audit_events_created_at").on(table.createdAt),
  ],
);

/** Operator-applied legal/incident hold; null agent ID protects whole tenant. */
export const auditRetentionHolds = pgTable(
  "audit_retention_holds",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    agentId: text("agent_id"),
    reason: text("reason").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_retention_holds_active").on(table.tenantId, table.agentId, table.releasedAt),
  ],
);

export const requestBuckets = pgTable("request_buckets", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/**
 * Sponsorship budget accounting. A reservation is a first-class row with one state rather than a
 * pair of log rows that must be correlated by hand. `releasedAt` is only set through an atomic
 * `reserved -> released` transition, so a repeated release cannot credit twice.
 */
export const sponsorReservations = pgTable(
  "sponsor_reservations",
  {
    operationId: text("operation_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    state: text("state").$type<SponsorReservationState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    // The daily window is counted per tenant and per agent, excluding released rows.
    index("sponsor_reservations_window").on(table.createdAt, table.tenantId, table.agentId),
    index("sponsor_reservations_agent").on(table.tenantId, table.agentId, table.createdAt.desc()),
    check(
      "sponsor_reservations_state_check",
      sql`${table.state} IN ('reserved', 'committed', 'released')`,
    ),
    check(
      "sponsor_reservations_release_check",
      sql`(${table.state} = 'released') = (${table.releasedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * USD spend accounting for the owner's budget. One row per execution that moves value out of the
 * agent (swap, withdraw, transfer), inserted in the same transaction that commits the execution's
 * dispatch, so a charge exists exactly when the write may reach the provider and there is never a
 * provisional hold to strand or to release from the wrong attempt.
 *
 * `released` is reached only by the winning commitment, through an atomic
 * `committed -> released` transition bound to `dispatchToken`, for a write the provider refused
 * before admitting it. Anything that may have moved value stays counted.
 */
export const spendCharges = pgTable(
  "spend_charges",
  {
    operationId: text("operation_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    action: text("action").notNull(),
    asset: text("asset").notNull(),
    /** Atomic amount of `asset`. */
    amount: text("amount").notNull(),
    /** USD value in millionths, rounded up once from the exact inputs below. */
    usdMicros: bigint("usd_micros", { mode: "number" }).notNull(),
    /** Token decimals and the exact price (`coefficient / 10^scale` USD per whole token). */
    decimals: integer("decimals").notNull(),
    priceCoefficient: text("price_coefficient").notNull(),
    priceScale: integer("price_scale").notNull(),
    /** The feed's own timestamp for the price, not when it was fetched. */
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }).notNull(),
    /** The budget revision whose caps admitted this charge. */
    budgetRevision: integer("budget_revision").notNull(),
    /** Random identity of the dispatch commitment that created the charge; only it may refund. */
    dispatchToken: text("dispatch_token").notNull(),
    state: text("state").$type<SpendChargeState>().notNull(),
    /** Database time of the admission decision; the rolling windows count from it. */
    chargedAt: timestamp("charged_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    index("spend_charges_agent_window").on(table.tenantId, table.agentId, table.chargedAt),
    check("spend_charges_state_check", sql`${table.state} IN ('committed', 'released')`),
    check(
      "spend_charges_release_check",
      sql`(${table.state} = 'released') = (${table.releasedAt} IS NOT NULL)`,
    ),
    check("spend_charges_usd_check", sql`${table.usdMicros} >= 0`),
  ],
);

/**
 * Owner-issued delegation of bounded execution authority to one grant token. A tenant API key
 * proves which partner is calling; only this row proves the end owner authorized the holder of
 * this grant's token to act on this agent, within these actions and recipients. Rows are
 * immutable except for revocation; an agent holds many live grants at once.
 */
export const agentGrants = pgTable(
  "agent_grants",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    label: text("label").notNull(),
    /** SHA-256 of the grant token; the token itself is never stored. */
    credentialHash: text("credential_hash").notNull(),
    actions: text("actions").array().$type<string[]>().notNull(),
    recipients: jsonb("recipients").$type<GrantDestination[]>().notNull(),
    signingAudiences: text("signing_audiences").array().$type<string[]>().notNull().default([]),
    /** Owner authority generation that issued this grant. */
    ownerEpoch: bigint("owner_epoch", { mode: "number" }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    /** The canonical owner-signed message, kept for independent audit reconstruction. */
    ownerMessage: jsonb("owner_message").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    uniqueIndex("agent_grants_credential").on(table.credentialHash),
    index("agent_grants_agent").on(table.tenantId, table.agentId, table.createdAt.desc()),
  ],
);

export const ownerNonces = pgTable(
  "owner_nonces",
  {
    nonce: text("nonce").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("owner_nonces_agent").on(table.tenantId, table.agentId),
    // Expired-nonce cleanup deletes by expiry; without this it scans the table each time.
    index("owner_nonces_expires").on(table.expiresAt),
  ],
);

export const delayedExecutions = pgTable(
  "delayed_executions",
  {
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    id: text("id").notNull(),
    grantId: text("grant_id").notNull(),
    ownerEpoch: bigint("owner_epoch", { mode: "number" }).notNull(),
    executeAfter: timestamp("execute_after", { withTimezone: true }).notNull(),
    state: text("state")
      .$type<"waiting" | "dispatching" | "finished" | "cancelled" | "uncertain">()
      .notNull()
      .default("waiting"),
    ciphertext: text("ciphertext"),
    nonce: text("nonce"),
    keyId: text("key_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.agentId, table.id],
      foreignColumns: [operations.tenantId, operations.agentId, operations.id],
    }),
    index("delayed_executions_due").on(table.state, table.executeAfter),
    check(
      "delayed_executions_state",
      sql`${table.state} IN ('waiting', 'dispatching', 'finished', 'cancelled', 'uncertain')`,
    ),
  ],
);

/**
 * One owner action awaiting, or authorized by, the owner's wallet signature. The server builds
 * the exact payload the wallet signs and keeps it here with the data needed to verify and apply
 * the signature, so a client only has to carry the correlation id (the row id). Payloads hold
 * single-use nonces and public identities, never secrets.
 */
export const ownerIntents = pgTable(
  "owner_intents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    actorKeyId: text("actor_key_id").notNull(),
    type: text("type").notNull(),
    standard: text("standard").notNull(),
    /** Public identity whose wallet must sign. */
    signer: jsonb("signer").$type<OwnerWallet>().notNull(),
    /** `{ standard, payload }` exactly as returned to the client. */
    intent: jsonb("intent").$type<unknown>().notNull(),
    /** Server-side data the submission is verified and applied against. */
    context: jsonb("context").$type<unknown>().notNull(),
    preview: jsonb("preview").$type<unknown>().notNull(),
    state: text("state").$type<OwnerIntentState>().notNull().default("pending_signature"),
    /** Operation that carries the on-chain or provider outcome, when there is one. */
    operationId: text("operation_id"),
    /** Final details of an intent applied synchronously. */
    result: jsonb("result").$type<unknown>(),
    failureCode: text("failure_code"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    unique("owner_intents_idempotency").on(table.tenantId, table.idempotencyKey),
    index("owner_intents_agent_created").on(table.tenantId, table.agentId, table.createdAt.desc()),
    index("owner_intents_operation").on(table.tenantId, table.agentId, table.operationId),
    check(
      "owner_intents_state_check",
      sql`${table.state} IN ('pending_signature', 'submitted', 'completed', 'failed')`,
    ),
    check(
      "owner_intents_standard_check",
      sql`${table.standard} IN ('nep413', 'nep366', 'eip712', 'webauthn')`,
    ),
  ],
);

/** Reserves request/resource identity before any generation side effect; no agent FK yet. */
export const intentGenerations = pgTable(
  "intent_generations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash").notNull(),
    agentId: text("agent_id").notNull(),
    state: text("state").$type<"reserved" | "building" | "ready">().notNull().default("reserved"),
    draft: jsonb("draft").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("intent_generations_idempotency").on(table.tenantId, table.idempotencyKey),
    check(
      "intent_generations_state_check",
      sql`${table.state} IN ('reserved', 'building', 'ready')`,
    ),
  ],
);

/** Original consent evidence. No public API exposes these proof fields. Retained with grant history. */
export const ownerReceipts = pgTable(
  "owner_receipts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id").notNull(),
    ownerEpoch: bigint("owner_epoch", { mode: "number" }).notNull(),
    nonce: text("nonce").notNull(),
    payloadHash: text("payload_hash").notNull(),
    message: jsonb("message").$type<unknown>().notNull(),
    proof: jsonb("proof").$type<unknown>().notNull(),
    original: jsonb("original").$type<unknown>(),
    verification: jsonb("verification").$type<unknown>().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [agents.tenantId, agents.id],
    }),
    uniqueIndex("owner_receipts_nonce").on(table.tenantId, table.agentId, table.nonce),
  ],
);

export const quotaChanges = pgTable(
  "quota_changes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    revision: integer("revision").notNull(),
    operator: text("operator").notNull(),
    reason: text("reason").notNull(),
    previous: jsonb("previous").$type<PartnerQuotaProfile>().notNull(),
    profile: jsonb("profile").$type<PartnerQuotaProfile>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("quota_changes_revision").on(table.tenantId, table.revision)],
);

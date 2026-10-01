import {
  evmSignatureSchema,
  executionRequestSchema,
  executionResultSchema,
  type OperationKind,
  ownerWalletSchema,
  policyOperationResultSchema,
  signatureSchema,
} from "@near-intents-agent-api/contracts";
import { z } from "zod";
import { storageFundingSchema } from "../wallet/storage-funding.js";

const maxDepth = 6;
const maxPolicyRequestDepth = 10;
const maxNodes = 10_000;
const maxResultBytes = 512 * 1024;
const traversalByteBudget = maxResultBytes - 256;
const limitMarker = "[redacted: result inspection limit reached]";
const statusSchema = z.enum([
  "timelocked",
  "pending",
  "pending_approval",
  "pending_deposit",
  "pending_wallet_signature",
  "processing",
  "approved",
  "success",
  "partially_failed",
  "failed",
  "refunded",
  "rejected",
  "expired",
  "cancelled",
  "needs_review",
  "unknown",
  "completed",
  "uncertain",
  "dispatching",
  "submitted",
  "applied",
]);
const secretNames = new Set([
  "apikey",
  "authorization",
  "bearer",
  "credential",
  "mnemonic",
  "password",
  "privatekey",
  "secret",
  "seed",
  "seedphrase",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
]);
const evidenceFields = new Set([
  "credential_erased",
  "approval_id",
  "request_hash",
  "tx_hash",
  "intent_hash",
  "transfer_intent_hash",
  "destination_tx_hash",
  "receipt_id",
  "receipt_hash",
  "settlement_status",
  "settlement_tx_hash",
  "settled_at",
  "refund_tx_hash",
  "refund_status",
  "failure_code",
  "failure_reason",
  "fee",
  "fee_amount",
  "fee_token",
  "provider_fee",
  "provider_fee_amount",
  "provider_fee_token",
  "solver_fee",
  "solver_fee_amount",
  "solver_fee_token",
  "protocol_fee",
  "protocol_fee_amount",
  "protocol_fee_token",
  "amount_out",
  "deposit_address",
  "intent_id",
  "expires_at",
  "estimated_time_secs",
  "poll_url",
  "token",
  "amount",
  "created_at",
  "memo",
  "required",
  "approved",
  "already_registered",
  "promises",
]);
const evidenceRowFields = new Set([
  "receipt_id",
  "receipt_hash",
  "tx_hash",
  "intent_hash",
  "transfer_intent_hash",
  "destination_tx_hash",
  "settlement_tx_hash",
  "settlement_status",
  "refund_tx_hash",
  "refund_status",
  "token",
  "amount",
  "created_at",
  "memo",
  "status",
]);
const evidenceScalar = z.union([z.string().max(1024), z.number().finite(), z.boolean(), z.null()]);
const assetId = z
  .string()
  .max(256)
  .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?(?::[A-Za-z0-9_.-]+)?$/)
  .refine(
    (value) =>
      value === "native" ||
      value.includes(".") ||
      value.includes(":") ||
      /^[A-Z0-9]{2,12}$/.test(value),
  );
const executeExtras: Record<string, z.ZodType> = {
  execute_after: z.iso.datetime(),
  delay_seconds: z.number().int().nonnegative(),
  status: statusSchema,
  wallet_id: z.string().max(256),
  grant_id: z.string().max(256),
  policy_hash: z.string().max(256),
  request: executionRequestSchema,
  beneficiary: z.string().max(256),
  chain: z.string().max(64),
  confirm_asset_loss: z.boolean(),
  provider_status: statusSchema,
};
const sponsorFields = {
  sponsor_account_id: z.string().min(2).max(64),
  sponsor_public_key: z.string().max(128),
  /** Access-key nonce of the sponsor transaction; proves a never-seen hash was dropped. */
  sponsor_nonce: z.string().regex(/^[0-9]{1,20}$/),
};
const policyExtras: Record<string, z.ZodType> = {
  ...sponsorFields,
  status: z.enum([
    "pending",
    "pending_wallet_signature",
    "dispatching",
    "submitted",
    "applied",
    "failed",
  ]),
  policy_id: z.string().max(128),
  onboarding: z.literal(true),
  owner: ownerWalletSchema,
  expires_at: z.iso.datetime(),
  authorization: z.literal("wallet_signature"),
  enforced_by: z.literal("outlayer_contract"),
  failure_code: z.string().max(256),
  storage_funding: storageFundingSchema,
};
const relayFields: Record<string, z.ZodType> = {
  ...sponsorFields,
  transactionHash: z.string().max(128),
  finalExecutionStatus: z.string().max(256),
  status: statusSchema,
  provider_request_id: z.string().max(128).nullable(),
  failure_code: z.string().max(256),
  purpose: z.literal("custody_working_balance"),
  funding_kind: z.literal("native_balance_top_up"),
  feePayer: z.literal("backend"),
  sponsor_id: z.string().max(256),
  receiver_id: z.string().max(256),
  amount_yocto: z.string().regex(/^[0-9]{1,78}$/),
  transaction_hash: z.string().max(128).nullable(),
};

type Flags = {
  secretRemoved: boolean;
  trimmed: boolean;
  nodes: number;
  bytes: number;
  overflow: boolean;
};
type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

export function isSecretFieldName(key: string) {
  const name = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    secretNames.has(name) ||
    name.endsWith("apikey") ||
    name.endsWith("accesstoken") ||
    name.endsWith("refreshtoken") ||
    name.endsWith("sessiontoken") ||
    name.endsWith("privatekey") ||
    (name.endsWith("key") && !name.endsWith("publickey")) ||
    name.endsWith("secret") ||
    name.endsWith("credential") ||
    (name !== "token" && name.endsWith("token"))
  );
}

function parsed(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

function copyEvidenceField(
  output: RecordValue,
  key: string,
  field: unknown,
  flags: Flags,
  row: boolean,
) {
  if (isSecretFieldName(key)) {
    flags.secretRemoved = true;
    return;
  }
  if (!(row ? evidenceRowFields : evidenceFields).has(key)) {
    flags.trimmed = true;
    return;
  }
  if (!row && key === "promises") {
    if (!Array.isArray(field) || field.length > 256) {
      flags.trimmed = true;
      return;
    }
    output[key] = field
      .map((entry) => projectEvidence(entry, flags, true))
      .filter((entry) => entry !== undefined);
    return;
  }
  const safe = parsed(key === "token" ? assetId : evidenceScalar, field);
  if (safe === undefined) {
    flags.trimmed = true;
    if (key === "token") flags.secretRemoved = true;
  } else output[key] = safe;
}

function projectEvidence(value: unknown, flags: Flags, row = false): RecordValue | undefined {
  const source = asRecord(value);
  if (!source) {
    flags.trimmed = true;
    return undefined;
  }
  const output: RecordValue = {};
  for (const [key, field] of Object.entries(source))
    copyEvidenceField(output, key, field, flags, row);
  return output;
}

function projectField(
  key: string,
  value: unknown,
  flags: Flags,
  schemaFields: Record<string, z.ZodType>,
  extraFields: Record<string, z.ZodType>,
  extraProjection?: (key: string, value: unknown) => unknown,
): unknown {
  if (schemaFields[key]) {
    const safe = parsed(schemaFields[key], value);
    return safe === undefined && extraFields[key] ? parsed(extraFields[key], value) : safe;
  }
  if (extraFields[key]) return parsed(extraFields[key], value);
  if (isSecretFieldName(key)) {
    flags.secretRemoved = true;
    return undefined;
  }
  if (key === "evidence") return projectEvidence(value, flags);
  if (evidenceFields.has(key)) {
    const evidence = projectEvidence({ [key]: value }, flags);
    return evidence && Object.hasOwn(evidence, key) ? evidence[key] : undefined;
  }
  return extraProjection?.(key, value);
}

function projectFields(
  source: RecordValue,
  flags: Flags,
  schemaFields: Record<string, z.ZodType>,
  extraFields: Record<string, z.ZodType>,
  extraProjection?: (key: string, value: unknown) => unknown,
): RecordValue {
  const output: RecordValue = {};
  for (const [key, value] of Object.entries(source)) {
    const safe = projectField(key, value, flags, schemaFields, extraFields, extraProjection);
    if (safe === undefined) {
      flags.trimmed = true;
      continue;
    }
    output[key] = safe;
  }
  return output;
}

function projectByKind(kind: OperationKind, value: unknown, flags: Flags): RecordValue {
  const source = asRecord(value);
  if (!source) {
    flags.trimmed = true;
    return {};
  }
  if (kind === "sign") {
    const signature = parsed(signatureSchema, source) ?? parsed(evmSignatureSchema, source);
    if (signature !== undefined) return signature as RecordValue;
    return projectFields(source, flags, {}, {}, (key, field) => {
      if (key === "status") return parsed(statusSchema, field);
      if (key === "provider_request_id") return parsed(z.string().max(128).nullable(), field);
      if (key === "failure_code") return parsed(z.string().max(256), field);
      return undefined;
    });
  }
  if (kind === "execute")
    return projectFields(
      source,
      flags,
      executionResultSchema.shape as Record<string, z.ZodType>,
      executeExtras,
    );
  if (kind === "policy")
    return projectFields(
      source,
      flags,
      policyOperationResultSchema.shape as Record<string, z.ZodType>,
      policyExtras,
    );
  return projectFields(source, flags, relayFields, {});
}

function reserveBytes(bytes: number, flags: Flags) {
  if (flags.bytes + bytes > traversalByteBudget) {
    flags.overflow = true;
    flags.trimmed = true;
    return false;
  }
  flags.bytes += bytes;
  return true;
}

function stringByteUpperBound(value: string) {
  return Buffer.byteLength(value, "utf8") * 6 + 2;
}

function cutoff(flags: Flags) {
  flags.trimmed = true;
  reserveBytes(stringByteUpperBound(limitMarker), flags);
  return limitMarker;
}

function cloneArray(value: unknown[], depth: number, flags: Flags, depthLimit: number) {
  if (!reserveBytes(2, flags)) return limitMarker;
  const output: unknown[] = [];
  for (const entry of value) {
    if (!reserveBytes(1, flags)) return limitMarker;
    if (flags.nodes >= maxNodes) {
      output.push(cutoff(flags));
      break;
    }
    output.push(boundedClone(entry, depth + 1, flags, depthLimit));
    if (flags.overflow) return limitMarker;
  }
  return output;
}

function cloneRecord(value: RecordValue, depth: number, flags: Flags, depthLimit: number) {
  if (!reserveBytes(2, flags)) return limitMarker;
  const output: RecordValue = {};
  for (const [key, entry] of Object.entries(value)) {
    const secretToken = key.toLowerCase() === "token" && !assetId.safeParse(entry).success;
    if (
      (isSecretFieldName(key) && !(key === "authorization" && entry === "wallet_signature")) ||
      secretToken
    ) {
      flags.secretRemoved = true;
      continue;
    }
    if (!reserveBytes(stringByteUpperBound(key) + 2, flags)) return limitMarker;
    if (flags.nodes >= maxNodes) {
      output[key] = cutoff(flags);
      break;
    }
    output[key] = boundedClone(entry, depth + 1, flags, depthLimit);
    if (flags.overflow) return limitMarker;
  }
  return output;
}

function boundedClone(value: unknown, depth: number, flags: Flags, depthLimit: number): unknown {
  flags.nodes += 1;
  if (flags.nodes > maxNodes || depth > depthLimit) {
    return cutoff(flags);
  }
  if (typeof value === "string") {
    if (
      Buffer.byteLength(value, "utf8") > maxResultBytes ||
      !reserveBytes(stringByteUpperBound(value), flags)
    ) {
      flags.trimmed = true;
      flags.overflow = true;
      return limitMarker;
    }
    return value;
  }
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || !reserveBytes(Buffer.byteLength(serialized, "utf8"), flags)) {
      flags.trimmed = true;
      return limitMarker;
    }
    return value;
  }
  return Array.isArray(value)
    ? cloneArray(value, depth, flags, depthLimit)
    : cloneRecord(value as RecordValue, depth, flags, depthLimit);
}

function sourceHasTypedWalletRequest(value: unknown) {
  const source = asRecord(value);
  return (
    source?.wallet_request !== undefined &&
    policyOperationResultSchema.shape.wallet_request.safeParse(source.wallet_request).success
  );
}

/** Positive per-operation projection followed by bounded, fail-closed traversal. */
export function redactOperationResult<T>(result: T, kind: OperationKind): T {
  const flags: Flags = {
    secretRemoved: false,
    trimmed: false,
    nodes: 0,
    bytes: 0,
    overflow: false,
  };
  const projected = projectByKind(kind, result, flags);
  const prior = asRecord(result);
  flags.secretRemoved ||= prior?.secret_redacted === true;
  flags.trimmed ||= prior?.result_redacted === true;
  const hasTypedPolicyWalletRequest = kind === "policy" && sourceHasTypedWalletRequest(result);
  const cloned = boundedClone(
    projected,
    0,
    flags,
    hasTypedPolicyWalletRequest ? maxPolicyRequestDepth : maxDepth,
  );
  if (flags.overflow)
    return {
      result_redacted: true,
      ...(flags.secretRemoved ? { secret_redacted: true } : {}),
    } as T;
  const output = asRecord(cloned) ?? { result_redacted: true };
  if (flags.secretRemoved) output.secret_redacted = true;
  if (flags.trimmed) output.result_redacted = true;
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > maxResultBytes)
    return {
      result_redacted: true,
      ...(flags.secretRemoved ? { secret_redacted: true } : {}),
    } as T;
  return output as T;
}

/** Generic operation projections never carry signing artifacts. */
export function projectOperationResult<T>(kind: OperationKind, result: T): T | RecordValue {
  const projected = redactOperationResult(result, kind) as RecordValue;
  if (kind === "sign") {
    return {
      redacted: true,
      ...(typeof projected.status === "string" ? { status: projected.status } : {}),
      ...(typeof projected.provider_request_id === "string"
        ? { provider_request_id: projected.provider_request_id }
        : {}),
    };
  }
  return projected;
}

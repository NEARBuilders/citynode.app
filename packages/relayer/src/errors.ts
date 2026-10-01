/**
 * Stable relay rejection codes. Every one of these is decided before any transaction is
 * broadcast, so a caller that sees one can treat the relay as refuted rather than uncertain.
 */
export type RelayErrorCode =
  | "relay_receiver_denied"
  | "relay_owner_mismatch"
  | "relay_signature_invalid"
  | "relay_gas_limit"
  | "relay_authority_expired"
  | "relay_disabled"
  | "policy_delegate_expired"
  | "sponsor_balance_insufficient";

const statusByCode: Record<RelayErrorCode, 400 | 401 | 403 | 409 | 503> = {
  relay_receiver_denied: 403,
  relay_owner_mismatch: 403,
  relay_signature_invalid: 401,
  relay_gas_limit: 400,
  relay_authority_expired: 409,
  relay_disabled: 503,
  policy_delegate_expired: 409,
  sponsor_balance_insufficient: 503,
};

export class RelayError extends Error {
  readonly status: 400 | 401 | 403 | 409 | 503;

  constructor(
    public code: RelayErrorCode,
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "RelayError";
    this.status = statusByCode[code];
  }
}

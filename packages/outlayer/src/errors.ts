/** Stable provider error consumed by the application error mapper. */
export const providerRefusalCodes = new Set([
  // The route's minimum: 1Click refuses to bridge less (confidential swaps and deposits).
  "amount_too_low",
  // 1Click will not quote this asset pair right now; nothing was admitted.
  "route_unavailable",
  "custody_native_balance_required",
  "invalid_address",
  "insufficient_balance",
  "invalid_request",
  "policy_denied",
  "policy_not_found",
  "request_failed",
  "sign_recipient_denied",
  "unsupported_chain",
  "unsupported_token",
  // One money operation per custody wallet: an overlapping request is refused before admission.
  "wallet_busy",
  "wallet_frozen",
]);

export class OutlayerError extends Error {
  constructor(
    public code: string,
    public status?: number,
    /**
     * True when the transport had already sent this request once before the answer this error
     * reports, so an earlier attempt may still be running at the provider.
     */
    public resent = false,
    /**
     * The provider's own `error` code when it is not one of the stable codes above, for operator
     * logs only. Kept only when it is a bare identifier, so no message or reflected value leaks.
     */
    public providerCode?: string,
  ) {
    super(code);
    this.name = "OutlayerError";
  }
}

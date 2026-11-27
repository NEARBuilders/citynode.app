import { Data } from "effect";
import { FEATURE_AREA_MESSAGES, isFeatureArea } from "@/lib/feature-areas";
import type { AppMessageId, AppTranslator } from "./catalogs";

export class AuthClientError extends Data.TaggedError("AuthClientError")<{
  message: string;
  status?: number;
  code?: string;
}> {
  constructor(error: { message?: string; status?: number; code?: string }) {
    super({ message: error.message ?? "", status: error.status, code: error.code });
  }
}

export class AppActionError extends Data.TaggedError("AppActionError")<{
  messageId: AppMessageId;
  values?: Record<string, string | number>;
}> {
  constructor(messageId: AppMessageId, values?: Record<string, string | number>) {
    super({ messageId, values });
  }
}

function errorStatusAndCode(error: unknown) {
  if (!error || typeof error !== "object") return { status: undefined, code: undefined };
  return { status: Reflect.get(error, "status"), code: Reflect.get(error, "code") };
}

export function isSessionError(error: unknown) {
  const { status, code } = errorStatusAndCode(error);
  return status === 401 || code === "UNAUTHORIZED";
}

export function isPermissionError(error: unknown) {
  const { status, code } = errorStatusAndCode(error);
  return status === 403 || code === "FORBIDDEN";
}

export function isNotFoundError(error: unknown) {
  const { status, code } = errorStatusAndCode(error);
  return status === 404 || code === "NOT_FOUND";
}

export function isConflictError(error: unknown) {
  const { status, code } = errorStatusAndCode(error);
  return status === 409 || code === "CONFLICT";
}

const WALLET_CANCELLED_PATTERN =
  /user (?:rejected|cancelled|canceled|closed)|request (?:rejected|cancelled|canceled)|cancelled by user|popup closed|wallet closed/i;

export function isWalletCancelled(error: unknown) {
  const { code } = errorStatusAndCode(error);
  return (
    code === "ACTION_REJECTED" ||
    (error instanceof Error && WALLET_CANCELLED_PATTERN.test(error.message))
  );
}

export function isNearUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const data = Reflect.get(error, "data");
  return (
    Reflect.get(error, "code") === "SERVICE_UNAVAILABLE" &&
    !!data &&
    typeof data === "object" &&
    Reflect.get(data, "reason") === "NEAR_RPC_UNAVAILABLE"
  );
}

function errorData(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const data = Reflect.get(error, "data");
  return data && typeof data === "object" ? data : undefined;
}

function stakingPoolErrorMessage(error: unknown): AppMessageId | null {
  const { code } = errorStatusAndCode(error);
  const data = errorData(error);
  if (
    code === "CONNECTION_ERROR" &&
    data &&
    Reflect.get(data, "errorCode") === "STAKING_POOL_CHECK_FAILED"
  ) {
    return "stake.poolCheckFailed";
  }
  const validationErrors = data ? Reflect.get(data, "validationErrors") : undefined;
  if (
    code === "BAD_REQUEST" &&
    Array.isArray(validationErrors) &&
    validationErrors.some((entry) => entry?.code === "STAKING_POOL_NOT_APPROVED")
  ) {
    return "tenant.notApprovedPool";
  }
  return null;
}

const AUTH_CODE_MESSAGES: Partial<Record<string, AppMessageId>> = {
  ORGANIZATION_SLUG_ALREADY_TAKEN: "org.handleTakenError",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "org.leaveOnlyOwner",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "org.leaveOnlyOwner",
};

function authCodeMessage(error: unknown): AppMessageId | undefined {
  const { code } = errorStatusAndCode(error);
  return typeof code === "string" ? AUTH_CODE_MESSAGES[code] : undefined;
}

function deniedFeatureArea(error: unknown) {
  const data = errorData(error);
  const required = data ? Reflect.get(data, "requiredPermissions") : undefined;
  if (!Array.isArray(required)) return undefined;
  return required.filter((permission) => typeof permission === "string").find(isFeatureArea);
}

export function appErrorMessage(
  error: unknown,
  t: AppTranslator,
  fallback: AppMessageId = "error.action",
) {
  if (error instanceof AppActionError) return t(error.messageId, error.values);
  if (isSessionError(error)) return t("error.session");
  if (isPermissionError(error)) {
    const area = deniedFeatureArea(error);
    return area
      ? t("permissions.teamDenied", { area: t(FEATURE_AREA_MESSAGES[area]) })
      : t("error.permission");
  }
  const authMessage = authCodeMessage(error);
  if (authMessage) return t(authMessage);
  if (isConflictError(error)) return t("error.conflict");
  if (isNearUnavailableError(error)) return t("error.nearUnavailable");
  const stakingPoolMessage = stakingPoolErrorMessage(error);
  if (stakingPoolMessage) return t(stakingPoolMessage);
  if (isWalletCancelled(error)) return t("wallet.cancelled");
  return t(fallback);
}

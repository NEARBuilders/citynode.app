import { Data } from "effect";
import { FEATURE_AREA_MESSAGES, isFeatureArea } from "@/lib/feature-areas";
import type { AppMessageId, AppTranslator } from "./catalogs";

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
  const { status, code } = errorStatusAndCode(error);
  if (isSessionError(error)) return t("error.session");
  if (isPermissionError(error)) {
    const area = deniedFeatureArea(error);
    return area
      ? t("permissions.teamDenied", { area: t(FEATURE_AREA_MESSAGES[area]) })
      : t("error.permission");
  }
  if (status === 409 || code === "CONFLICT") return t("error.conflict");
  if (isNearUnavailableError(error)) return t("error.nearUnavailable");
  const stakingPoolMessage = stakingPoolErrorMessage(error);
  if (stakingPoolMessage) return t(stakingPoolMessage);
  if (
    code === "ACTION_REJECTED" ||
    (error instanceof Error &&
      /user (?:rejected|cancelled)|request (?:rejected|cancelled)/i.test(error.message))
  )
    return t("wallet.cancelled");
  return t(fallback);
}

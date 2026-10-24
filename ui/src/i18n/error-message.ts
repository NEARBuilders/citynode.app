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

function deniedFeatureArea(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const data = Reflect.get(error, "data");
  if (!data || typeof data !== "object") return undefined;
  const required = Reflect.get(data, "requiredPermissions");
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
  if (
    code === "ACTION_REJECTED" ||
    (error instanceof Error &&
      /user (?:rejected|cancelled)|request (?:rejected|cancelled)/i.test(error.message))
  )
    return t("wallet.cancelled");
  return t(fallback);
}

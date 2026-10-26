import { Data } from "effect";
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

const WALLET_CANCELLED_PATTERN =
  /user (?:rejected|cancelled|canceled|closed)|request (?:rejected|cancelled|canceled)|cancelled by user|popup closed|wallet closed/i;

export function isWalletCancelled(error: unknown) {
  const { code } = errorStatusAndCode(error);
  return (
    code === "ACTION_REJECTED" ||
    (error instanceof Error && WALLET_CANCELLED_PATTERN.test(error.message))
  );
}

export function appErrorMessage(
  error: unknown,
  t: AppTranslator,
  fallback: AppMessageId = "error.action",
) {
  if (error instanceof AppActionError) return t(error.messageId, error.values);
  const { status, code } = errorStatusAndCode(error);
  if (isSessionError(error)) return t("error.session");
  if (isPermissionError(error)) return t("error.permission");
  if (status === 409 || code === "CONFLICT") return t("error.conflict");
  if (isWalletCancelled(error)) return t("wallet.cancelled");
  return t(fallback);
}

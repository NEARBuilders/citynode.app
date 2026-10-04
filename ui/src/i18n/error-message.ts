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

export function appErrorMessage(
  error: unknown,
  t: AppTranslator,
  fallback: AppMessageId = "error.action",
) {
  if (error instanceof AppActionError) return t(error.messageId, error.values);
  const status = error && typeof error === "object" ? Reflect.get(error, "status") : undefined;
  const code = error && typeof error === "object" ? Reflect.get(error, "code") : undefined;
  if (status === 401 || code === "UNAUTHORIZED") return t("error.session");
  if (status === 403 || code === "FORBIDDEN") return t("error.permission");
  if (status === 409 || code === "CONFLICT") return t("error.conflict");
  if (
    code === "ACTION_REJECTED" ||
    (error instanceof Error &&
      /user (?:rejected|cancelled)|request (?:rejected|cancelled)/i.test(error.message))
  )
    return t("wallet.cancelled");
  return t(fallback);
}

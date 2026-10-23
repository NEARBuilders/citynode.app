import { Data } from "effect";
import type { LoginMessageId, LoginTranslator } from "./catalogs";

export class LoginActionError extends Data.TaggedError("LoginActionError")<{
  messageId: LoginMessageId;
}> {
  constructor(messageId: LoginMessageId) {
    super({ messageId });
  }
}

export function authErrorMessage(error: unknown, t: LoginTranslator) {
  if (error instanceof LoginActionError) return t(error.messageId);
  const status = error && typeof error === "object" ? Reflect.get(error, "status") : undefined;
  const code = error && typeof error === "object" ? Reflect.get(error, "code") : undefined;
  if (status === 401 || code === "UNAUTHORIZED") return t("auth.login.error.expired");
  return t("auth.error.action");
}

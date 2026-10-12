import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { isSyntheticEmail } from "./synthetic-email";

export const REQUEST_EMAIL_CHANGE_PATH = "/email-otp/request-email-change";
export const CONFIRM_EMAIL_CHANGE_PATH = "/email-otp/change-email";

export const UNUSED_EMAIL_OTP_PATHS = [
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
];

export function emailChangePolicy({ canSendEmail }: { canSendEmail: boolean }) {
  return {
    id: "email-change-policy",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path === REQUEST_EMAIL_CHANGE_PATH || ctx.path === CONFIRM_EMAIL_CHANGE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (!session) return;
            if (session.user.emailVerified && !isSyntheticEmail(session.user.email)) {
              throw new APIError("FORBIDDEN", { message: "Email is already verified" });
            }
            if (ctx.path === REQUEST_EMAIL_CHANGE_PATH && !canSendEmail) {
              throw new APIError("SERVICE_UNAVAILABLE", {
                message: "Email isn't set up on this server yet, so a code can't be sent.",
              });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

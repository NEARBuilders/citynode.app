import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
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

export function emailChangePolicy({
  emailProviderConfigured,
}: {
  emailProviderConfigured: boolean;
}) {
  return {
    id: "email-change-policy",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path === REQUEST_EMAIL_CHANGE_PATH || ctx.path === CONFIRM_EMAIL_CHANGE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getAuthoritativeSessionFromCtx(ctx);
            if (!session?.session) {
              throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
            }
            if (session.user.emailVerified && !isSyntheticEmail(session.user.email)) {
              throw new APIError("FORBIDDEN", { message: "Email is already verified" });
            }
            if (emailProviderConfigured) return;
            if (ctx.path === CONFIRM_EMAIL_CHANGE_PATH) {
              throw new APIError("BAD_REQUEST", { message: "No confirmation code was sent" });
            }
            const newEmail = String(ctx.body?.newEmail ?? "")
              .trim()
              .toLowerCase();
            if (!z.email().safeParse(newEmail).success) {
              throw new APIError("BAD_REQUEST", { message: "Invalid email" });
            }
            if (newEmail === session.user.email.toLowerCase()) {
              throw new APIError("BAD_REQUEST", { message: "Email is the same" });
            }
            if (!(await ctx.context.internalAdapter.findUserByEmail(newEmail))) {
              await ctx.context.internalAdapter.updateUser(session.user.id, {
                email: newEmail,
                emailVerified: false,
              });
              await setSessionCookie(ctx, {
                session: session.session,
                user: { ...session.user, email: newEmail, emailVerified: false },
              });
            }
            return { success: true, verificationRequired: false };
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

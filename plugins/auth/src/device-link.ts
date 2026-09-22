import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db";
import * as schema from "./db/schema";

export const DEVICE_LINK_CLIENT_ID = "citynode-web";

const claimBody = z.object({
  token: z.string().min(1),
});

export function deviceLink(db: Database) {
  return {
    id: "device-link",
    endpoints: {
      claimDeviceLink: createAuthEndpoint(
        "/device-link/claim",
        { method: "POST", body: claimBody },
        async (ctx) => {
          const [row] = await db
            .select({ session: schema.session, user: schema.user })
            .from(schema.session)
            .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
            .where(
              and(
                eq(schema.session.token, ctx.body.token),
                gt(schema.session.expiresAt, new Date()),
              ),
            )
            .limit(1);
          if (!row) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid or expired device link token" });
          }
          if (row.user.banned) {
            throw new APIError("FORBIDDEN", { message: "Account is banned" });
          }
          await setSessionCookie(ctx, {
            session: row.session,
            user: row.user,
          });
          return ctx.json({ success: true, user: { id: row.user.id, name: row.user.name } });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

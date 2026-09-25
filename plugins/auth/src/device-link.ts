import { createHash, randomUUID } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db";
import * as schema from "./db/schema";

export const DEVICE_LINK_CLAIM_TTL_MS = 60_000;
export const BOS_CLI_CLIENT_ID = "bos-cli";

const claimBody = z.object({
  token: z.string().min(1),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deviceLink(db: Database) {
  return {
    id: "device-link",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/device/token",
          handler: createAuthMiddleware(async (ctx) => {
            const issued = ctx.context.newSession;
            const clientId = (ctx.body as { client_id?: unknown } | undefined)?.client_id;
            if (!issued || typeof clientId !== "string") return;
            const [latestMembership] = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, issued.user.id))
              .orderBy(desc(schema.member.createdAt))
              .limit(1);
            await db.transaction(async (tx) => {
              if (latestMembership) {
                await tx
                  .update(schema.session)
                  .set({ activeOrganizationId: latestMembership.organizationId })
                  .where(eq(schema.session.token, issued.session.token));
              }
              await tx.insert(schema.deviceLinkClaim).values({
                id: randomUUID(),
                tokenHash: hashToken(issued.session.token),
                clientId,
                expiresAt: new Date(Date.now() + DEVICE_LINK_CLAIM_TTL_MS),
              });
            });
          }),
        },
      ],
    },
    endpoints: {
      claimDeviceLink: createAuthEndpoint(
        "/device-link/claim",
        { method: "POST", body: claimBody },
        async (ctx) => {
          const now = new Date();
          const [claim] = await db
            .update(schema.deviceLinkClaim)
            .set({ consumedAt: now })
            .where(
              and(
                eq(schema.deviceLinkClaim.tokenHash, hashToken(ctx.body.token)),
                isNull(schema.deviceLinkClaim.consumedAt),
                gt(schema.deviceLinkClaim.expiresAt, now),
              ),
            )
            .returning({ id: schema.deviceLinkClaim.id });
          if (!claim) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid or expired device link token" });
          }
          const [row] = await db
            .select({ session: schema.session, user: schema.user })
            .from(schema.session)
            .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
            .where(and(eq(schema.session.token, ctx.body.token), gt(schema.session.expiresAt, now)))
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

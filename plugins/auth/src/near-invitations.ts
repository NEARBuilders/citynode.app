import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db";
import * as schema from "./db/schema";

const NEAR_INVITATION_EMAIL_DOMAIN = "near-wallet.invalid";
const IMPLICIT_ACCOUNT = /^[0-9a-f]{64}$/;
const ETH_IMPLICIT_ACCOUNT = /^0x[0-9a-f]{40}$/;
const NAMED_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function normalizeNearAccountId(value: string): string | null {
  const accountId = value.trim().toLowerCase();
  if (IMPLICIT_ACCOUNT.test(accountId) || ETH_IMPLICIT_ACCOUNT.test(accountId)) return accountId;
  if (accountId.length < 2 || accountId.length > 64) return null;
  return NAMED_ACCOUNT.test(accountId) ? accountId : null;
}

export function nearInvitationEmail(accountId: string): string {
  return `${accountId}@${NEAR_INVITATION_EMAIL_DOMAIN}`;
}

export function isNearInvitation(invitation: unknown): boolean {
  return (
    !!invitation &&
    typeof invitation === "object" &&
    typeof (invitation as { nearAccountId?: unknown }).nearAccountId === "string"
  );
}

export async function listLinkedNearAccountIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: schema.nearAccount.accountId })
    .from(schema.nearAccount)
    .where(eq(schema.nearAccount.userId, userId));
  return rows.map((row) => row.accountId);
}

export async function listPendingNearInvitations(db: Database, userId: string) {
  const accountIds = await listLinkedNearAccountIds(db, userId);
  if (accountIds.length === 0) return [];
  return db
    .select({
      invitation: schema.invitation,
      organizationName: schema.organization.name,
      organizationSlug: schema.organization.slug,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.invitation.organizationId, schema.organization.id))
    .where(
      and(
        inArray(schema.invitation.nearAccountId, accountIds),
        eq(schema.invitation.status, "pending"),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );
}

async function findClaimableInvitation(db: Database, invitationId: string, userId: string) {
  const invitation = await db.query.invitation.findFirst({
    where: eq(schema.invitation.id, invitationId),
  });
  if (!invitation?.nearAccountId) {
    throw new APIError("BAD_REQUEST", { message: "Wallet invitation not found" });
  }
  if (invitation.status !== "pending") {
    throw new APIError("BAD_REQUEST", { message: `Invitation is already ${invitation.status}` });
  }
  if (invitation.expiresAt < new Date()) {
    throw new APIError("BAD_REQUEST", { message: "Invitation has expired" });
  }
  const linked = await listLinkedNearAccountIds(db, userId);
  if (!linked.includes(invitation.nearAccountId)) {
    throw new APIError("FORBIDDEN", {
      message: `This invitation is for ${invitation.nearAccountId}. Sign in with or link that NEAR account to accept it.`,
    });
  }
  return invitation;
}

const invitationBody = z.object({ invitationId: z.string() });

export function nearInvitations(db: Database) {
  return {
    id: "near-invitations",
    endpoints: {
      acceptNearInvitation: createAuthEndpoint(
        "/organization/accept-near-invitation",
        { method: "POST", body: invitationBody, use: [sessionMiddleware] },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          const invitation = await findClaimableInvitation(db, ctx.body.invitationId, user.id);
          const teamIds = invitation.teamId ? invitation.teamId.split(",") : [];

          const member = await db.transaction(async (tx) => {
            const existing = await tx.query.member.findFirst({
              where: and(
                eq(schema.member.userId, user.id),
                eq(schema.member.organizationId, invitation.organizationId),
              ),
            });
            if (existing) {
              throw new APIError("BAD_REQUEST", {
                message: "You are already a member of this organization",
              });
            }
            const [accepted] = await tx
              .update(schema.invitation)
              .set({ status: "accepted" })
              .where(
                and(
                  eq(schema.invitation.id, invitation.id),
                  eq(schema.invitation.status, "pending"),
                ),
              )
              .returning();
            if (!accepted) {
              throw new APIError("BAD_REQUEST", { message: "Invitation is no longer pending" });
            }
            for (const teamId of teamIds) {
              const team = await tx.query.team.findFirst({
                where: and(
                  eq(schema.team.id, teamId),
                  eq(schema.team.organizationId, invitation.organizationId),
                ),
              });
              if (!team) {
                throw new APIError("BAD_REQUEST", { message: "Invited team no longer exists" });
              }
              await tx.insert(schema.teamMember).values({
                id: crypto.randomUUID(),
                teamId,
                userId: user.id,
                createdAt: new Date(),
              });
            }
            const [created] = await tx
              .insert(schema.member)
              .values({
                id: crypto.randomUUID(),
                organizationId: invitation.organizationId,
                userId: user.id,
                role: invitation.role ?? "member",
                createdAt: new Date(),
              })
              .returning();
            return created;
          });

          const updated = await ctx.context.internalAdapter.updateSession(session.token, {
            activeOrganizationId: invitation.organizationId,
            activeTeamId: teamIds.length === 1 ? teamIds[0] : null,
          });
          if (updated) {
            await setSessionCookie(ctx, { session: updated as typeof session, user });
          }
          return ctx.json({ invitation: { ...invitation, status: "accepted" }, member });
        },
      ),
      rejectNearInvitation: createAuthEndpoint(
        "/organization/reject-near-invitation",
        { method: "POST", body: invitationBody, use: [sessionMiddleware] },
        async (ctx) => {
          const invitation = await findClaimableInvitation(
            db,
            ctx.body.invitationId,
            ctx.context.session.user.id,
          );
          await db
            .update(schema.invitation)
            .set({ status: "rejected" })
            .where(eq(schema.invitation.id, invitation.id));
          return ctx.json({ invitation: { ...invitation, status: "rejected" } });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

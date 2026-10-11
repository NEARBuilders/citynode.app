import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Context } from "effect";
import * as schema from "../db/schema";
import {
  isNearNetwork,
  listPendingNearInvitations,
  nearInvitationEmail,
  normalizeNearAccountId,
} from "../near-invitations";
import { AuthServicesTag } from "../service-types";
import { isSyntheticEmail } from "../synthetic-email";
import { canReadMemberEmails, createHeaders, safeAuthApi } from "../utils";

function resolveInvitee(input: { email?: string; nearAccountId?: string; nearNetwork?: string }) {
  if (!!input.email === !!input.nearAccountId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Provide either an email address or a NEAR account id",
    });
  }
  if (input.email) {
    if (input.nearNetwork !== undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A NEAR network can only be supplied for wallet invitations",
      });
    }
    return { email: input.email };
  }
  const nearAccountId = normalizeNearAccountId(input.nearAccountId ?? "");
  if (!nearAccountId) {
    throw new ORPCError("BAD_REQUEST", {
      message: `"${input.nearAccountId}" is not a valid NEAR account id`,
    });
  }
  if (!isNearNetwork(input.nearNetwork)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A wallet invitation requires a mainnet or testnet network",
    });
  }
  return {
    email: nearInvitationEmail(nearAccountId, input.nearNetwork),
    nearAccountId,
    nearNetwork: input.nearNetwork,
  };
}

function toInvitation(invitation: any) {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt:
      invitation.expiresAt instanceof Date ? invitation.expiresAt : new Date(invitation.expiresAt),
    inviterId: invitation.inviterId,
    teamId: invitation.teamId ?? null,
    nearAccountId: invitation.nearAccountId ?? null,
    nearNetwork: invitation.nearNetwork ?? null,
  };
}

async function invitationForPlaceholderUser(services: any, headers: Headers, invitationId: string) {
  const session = await services.auth.api.getSession({ headers }).catch(() => null);
  const user = session?.user as { id: string; email: string } | undefined;
  if (!user || !isSyntheticEmail(user.email)) return null;
  const invitation = await services.db.query.invitation.findFirst({
    where: eq(schema.invitation.id, invitationId),
  });
  if (
    !invitation ||
    invitation.nearAccountId ||
    invitation.status !== "pending" ||
    new Date(invitation.expiresAt) < new Date()
  ) {
    return null;
  }
  return { user, invitation };
}

export function createInvitationHandlers(builder: any, requireAuth: any) {
  return {
    inviteMember: builder.inviteMember
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.createInvitation({
            headers: createHeaders(context.reqHeaders),
            body: {
              ...resolveInvitee(input),
              role: input.role,
              organizationId: input.organizationId,
              resend: input.resend,
              ...(input.teamId ? { teamId: input.teamId } : {}),
            },
          }),
        );
        return toInvitation(result);
      }),

    getInvitation: builder.getInvitation.handler(
      async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const headers = createHeaders(context.reqHeaders ?? {});
        try {
          const stored = await services.db.query.invitation.findFirst({
            where: eq(schema.invitation.id, input.id),
          });
          if (stored?.nearAccountId) {
            const session = await services.auth.api.getSession({ headers });
            if (!session?.user) return null;
            const pending = await listPendingNearInvitations(services.db, session.user.id);
            const match = pending.find((row) => row.invitation.id === input.id);
            if (!match) return null;
            const inviter = await services.db.query.user.findFirst({
              where: eq(schema.user.id, match.invitation.inviterId),
            });
            return {
              ...toInvitation(match.invitation),
              organizationName: match.organizationName,
              organizationSlug: match.organizationSlug,
              inviterName: inviter?.name ?? null,
              inviterEmail: null,
            };
          }
          const claimable = await invitationForPlaceholderUser(services, headers, input.id);
          if (claimable) {
            const [organization, inviter] = await Promise.all([
              services.db.query.organization.findFirst({
                where: eq(schema.organization.id, claimable.invitation.organizationId),
              }),
              services.db.query.user.findFirst({
                where: eq(schema.user.id, claimable.invitation.inviterId),
              }),
            ]);
            return {
              ...toInvitation(claimable.invitation),
              organizationName: organization?.name ?? null,
              organizationSlug: organization?.slug ?? null,
              inviterName: inviter?.name ?? null,
              inviterEmail: null,
            };
          }
          const invitation = await services.auth.api.getInvitation({
            headers,
            query: { id: input.id },
          });
          if (!invitation) return null;
          const inviter = await services.db.query.user.findFirst({
            where: eq(schema.user.id, invitation.inviterId),
          });
          return {
            ...toInvitation(invitation),
            organizationName: invitation.organizationName,
            organizationSlug: invitation.organizationSlug,
            inviterName: inviter?.name ?? null,
            inviterEmail: null,
          };
        } catch {
          return null;
        }
      },
    ),

    listInvitations: builder.listInvitations
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const emailAllowed = await canReadMemberEmails(services, context, input?.organizationId);
        const result = await safeAuthApi(() =>
          services.auth.api.listInvitations({
            headers: createHeaders(context.reqHeaders),
            query: {
              organizationId: input.organizationId,
            },
          }),
        );
        return (result ?? []).map((inv: any) => ({
          ...toInvitation(inv),
          ...(emailAllowed ? { email: inv.email } : { email: null }),
        }));
      }),

    listUserInvitations: builder.listUserInvitations
      .use(requireAuth)
      .handler(async ({ context }: { context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const [emailInvitations, walletInvitations] = await Promise.all([
          context.user?.emailVerified === false
            ? Promise.resolve([])
            : safeAuthApi(() =>
                services.auth.api.listUserInvitations({
                  headers: createHeaders(context.reqHeaders),
                }),
              ),
          listPendingNearInvitations(services.db, context.userId),
        ]);
        return [
          ...(emailInvitations ?? []).map((inv: any) => ({
            ...toInvitation(inv),
            ...(inv.organizationName ? { organizationName: inv.organizationName } : {}),
            ...(inv.organizationSlug ? { organizationSlug: inv.organizationSlug } : {}),
          })),
          ...walletInvitations.map((row) => ({
            ...toInvitation(row.invitation),
            organizationName: row.organizationName,
            organizationSlug: row.organizationSlug,
          })),
        ];
      }),

    cancelInvitation: builder.cancelInvitation
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.cancelInvitation({
            headers: createHeaders(context.reqHeaders),
            body: { invitationId: input.invitationId },
          }),
        );
        return { success: true };
      }),

    acceptInvitation: builder.acceptInvitation
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const headers = createHeaders(context.reqHeaders);
        const claimable = await invitationForPlaceholderUser(services, headers, input.invitationId);
        if (claimable) {
          const email = claimable.invitation.email.trim().toLowerCase();
          const holder = await services.db.query.user.findFirst({
            where: eq(schema.user.email, email),
          });
          if (holder && holder.id !== claimable.user.id) {
            throw new ORPCError("CONFLICT", {
              message: `This invitation is for ${email}, which belongs to another account. Sign in with that account to accept it.`,
            });
          }
          await services.db
            .update(schema.user)
            .set({ email, emailVerified: true, updatedAt: new Date() })
            .where(eq(schema.user.id, claimable.user.id));
        }
        await safeAuthApi(() =>
          services.auth.api.acceptInvitation({
            headers,
            body: { invitationId: input.invitationId },
          }),
        );
        return { success: true };
      }),

    acceptNearInvitation: builder.acceptNearInvitation
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.acceptNearInvitation({
            headers: createHeaders(context.reqHeaders),
            body: { invitationId: input.invitationId },
          }),
        );
        return { success: true };
      }),

    rejectNearInvitation: builder.rejectNearInvitation
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.rejectNearInvitation({
            headers: createHeaders(context.reqHeaders),
            body: { invitationId: input.invitationId },
          }),
        );
        return { success: true };
      }),

    rejectInvitation: builder.rejectInvitation
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.rejectInvitation({
            headers: createHeaders(context.reqHeaders),
            body: { invitationId: input.invitationId },
          }),
        );
        return { success: true };
      }),
  };
}

import { Context } from "effect";
import { AuthServicesTag } from "../service-types";
import { createHeaders, safeAuthApi } from "../utils";

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
  };
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
              email: input.email,
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
        try {
          const invitation = await services.auth.api.getInvitation({
            headers: createHeaders(context.reqHeaders ?? {}),
            query: { id: input.id },
          });
          if (!invitation) return null;
          return {
            id: invitation.id,
            organizationId: invitation.organizationId,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt:
              invitation.expiresAt instanceof Date
                ? invitation.expiresAt
                : new Date(invitation.expiresAt),
            inviterId: invitation.inviterId,
            organizationName: invitation.organizationName,
            organizationSlug: invitation.organizationSlug,
            inviterEmail: invitation.inviterEmail,
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
        const result = await safeAuthApi(() =>
          services.auth.api.listInvitations({
            headers: createHeaders(context.reqHeaders),
            query: {
              organizationId: input.organizationId,
            },
          }),
        );
        return (result ?? []).map(toInvitation);
      }),

    listUserInvitations: builder.listUserInvitations
      .use(requireAuth)
      .handler(async ({ context }: { context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.listUserInvitations({
            headers: createHeaders(context.reqHeaders),
          }),
        );
        return (result ?? []).map(toInvitation);
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
        await safeAuthApi(() =>
          services.auth.api.acceptInvitation({
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

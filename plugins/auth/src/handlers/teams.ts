import { Context } from "effect";
import { AuthServicesTag } from "../service-types";
import {
  createHeaders,
  getActiveOrganizationId,
  parseTeamAreas,
  safeAuthApi,
  serializeTeamAreas,
} from "../utils";

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return value ? new Date(value as string) : new Date();
}

function toTeam(team: any) {
  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
    areas: parseTeamAreas(team.metadata),
    createdAt: toDate(team.createdAt),
    updatedAt: toDate(team.updatedAt),
  };
}

export function createTeamHandlers(builder: any, requireAuth: any) {
  return {
    setActiveTeam: builder.setActiveTeam
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.setActiveTeam({
            headers: createHeaders(context.reqHeaders),
            body: { teamId: input.teamId },
          }),
        );
        return result ? toTeam(result) : null;
      }),

    listUserTeams: builder.listUserTeams
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const headers = createHeaders(context.reqHeaders);
        const organizationId =
          input?.organizationId ??
          getActiveOrganizationId((await services.auth.api.getSession({ headers }))?.session);
        const result = await safeAuthApi(() => services.auth.api.listUserTeams({ headers }));
        return (result ?? [])
          .filter((team: any) => !organizationId || team.organizationId === organizationId)
          .map(toTeam);
      }),

    createTeam: builder.createTeam
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.createTeam({
            headers: createHeaders(context.reqHeaders),
            body: {
              name: input.name,
              organizationId: input.organizationId,
              ...(input.areas ? { metadata: serializeTeamAreas(input.areas) } : {}),
            },
          }),
        );
        return toTeam(result);
      }),

    updateTeam: builder.updateTeam
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.updateTeam({
            headers: createHeaders(context.reqHeaders),
            body: {
              teamId: input.teamId,
              data: {
                ...(input.organizationId ? { organizationId: input.organizationId } : {}),
                ...(input.data.name !== undefined ? { name: input.data.name } : {}),
                ...(input.data.areas ? { metadata: serializeTeamAreas(input.data.areas) } : {}),
              },
            },
          }),
        );
        if (!result) {
          throw new Error("Team not found");
        }
        return toTeam(result);
      }),

    deleteTeam: builder.deleteTeam
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.removeTeam({
            headers: createHeaders(context.reqHeaders),
            body: {
              teamId: input.teamId,
              organizationId: input.organizationId,
            },
          }),
        );
        return { success: true };
      }),

    listTeams: builder.listTeams
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.listOrganizationTeams({
            headers: createHeaders(context.reqHeaders),
            query: {
              organizationId: input.organizationId,
            },
          }),
        );
        return (result ?? []).map(toTeam);
      }),

    listTeamMembers: builder.listTeamMembers
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.listTeamMembers({
            headers: createHeaders(context.reqHeaders),
            query: {
              teamId: input.teamId,
            },
          }),
        );
        return (result ?? []).map((tm: any) => ({
          id: tm.id,
          teamId: tm.teamId,
          userId: tm.userId,
          createdAt: tm.createdAt instanceof Date ? tm.createdAt : new Date(tm.createdAt),
        }));
      }),

    addTeamMember: builder.addTeamMember
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        const result = await safeAuthApi(() =>
          services.auth.api.addTeamMember({
            headers: createHeaders(context.reqHeaders),
            body: {
              teamId: input.teamId,
              userId: input.userId,
              organizationId: input.organizationId,
            },
          }),
        );
        return {
          id: result.id,
          teamId: result.teamId,
          userId: result.userId,
          createdAt:
            result.createdAt instanceof Date ? result.createdAt : new Date(result.createdAt),
        };
      }),

    removeTeamMember: builder.removeTeamMember
      .use(requireAuth)
      .handler(async ({ input, context }: { input: any; context: any }) => {
        const services = Context.get(context["effect/context"], AuthServicesTag);
        await safeAuthApi(() =>
          services.auth.api.removeTeamMember({
            headers: createHeaders(context.reqHeaders),
            body: {
              teamId: input.teamId,
              userId: input.userId,
              organizationId: input.organizationId,
            },
          }),
        );
        return { success: true };
      }),
  };
}

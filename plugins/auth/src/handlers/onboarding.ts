import { type Implementer, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { ContractType } from "../contract";
import * as schema from "../db/schema";
import type { AuthHandlerContext, RequireAuthMiddleware } from "../middleware";
import type { PluginServices } from "../service-types";
import { mapDomainError } from "../services/domain-errors";
import { OnboardingService } from "../services/onboarding";
import { createHeaders, getActiveOrganizationId, parseTeamAreas, safeAuthApi } from "../utils";

const EVENTS_AREA = "events";

export async function requireOrganizerContext(
  services: any,
  context: any,
  inputOrganizationId?: string,
  forbiddenAction = "manage onboarding codes",
): Promise<{ userId: string; organizationId: string; headers: Headers }> {
  const headers = createHeaders(context.reqHeaders);
  const session = await safeAuthApi(() => services.auth.api.getSession({ headers }));
  const sessionData = session as {
    user?: { id?: string };
    session?: { activeOrganizationId?: string | null };
  } | null;
  const userId = context.userId ?? sessionData?.user?.id ?? null;
  const organizationId =
    inputOrganizationId ?? getActiveOrganizationId(sessionData?.session) ?? null;
  if (!userId || !organizationId) {
    throw new ORPCError("BAD_REQUEST", { message: "No organization selected" });
  }
  const organization = await services.db.query.organization.findFirst({
    where: eq(schema.organization.id, organizationId),
  });
  if (organization?.status !== "active") {
    throw new ORPCError("FORBIDDEN", { message: "Organization requires platform-admin approval" });
  }
  const result = await safeAuthApi(() =>
    services.auth.api.getActiveMemberRole({
      headers,
      query: { organizationId },
    }),
  );
  const role = typeof result === "string" ? result : ((result as any)?.role ?? null);
  const isOrganizer =
    role === "owner" ||
    role === "admin" ||
    (role !== null && (await belongsToEventsTeam(services.db, userId, organizationId)));
  if (!isOrganizer) {
    throw new ORPCError("FORBIDDEN", {
      message: `Only organizers — organization owners, admins, or members of a team with the events area — can ${forbiddenAction}`,
    });
  }
  return { userId, organizationId, headers };
}

async function belongsToEventsTeam(
  db: PluginServices["db"],
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const teams = await db
    .select({ metadata: schema.team.metadata })
    .from(schema.teamMember)
    .innerJoin(schema.team, eq(schema.teamMember.teamId, schema.team.id))
    .where(
      and(eq(schema.teamMember.userId, userId), eq(schema.team.organizationId, organizationId)),
    );
  return teams.some((team) => parseTeamAreas(team.metadata).includes(EVENTS_AREA));
}

export function createOnboardingHandlers(
  builder: Implementer<ContractType, AuthHandlerContext>,
  requireAuth: RequireAuthMiddleware,
) {
  return {
    createOnboardingCode: builder.createOnboardingCode.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.createOnboardingCode(context, input));
    }),

    listOnboardingCodes: builder.listOnboardingCodes.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(
        onboarding.listOnboardingCodes(context, input?.organizationId, input?.eventId),
      );
    }),

    revokeOnboardingCode: builder.revokeOnboardingCode.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.revokeOnboardingCode(context, input));
    }),

    getOnboardingStation: builder.getOnboardingStation.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.getOnboardingStation(context, input));
    }),

    getOnboardingStatus: builder.getOnboardingStatus.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.getOnboardingStatus(context, input));
    }),

    getOnboardingCodeInfo: builder.getOnboardingCodeInfo.effect(function* ({ input }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.getOnboardingCodeInfo(input.code));
    }),

    redeemOnboardingCode: builder.redeemOnboardingCode.use(requireAuth).effect(function* ({
      input,
      context,
    }) {
      const onboarding = yield* OnboardingService;
      return yield* mapDomainError(onboarding.redeemOnboardingCode(context, input.code));
    }),
  };
}

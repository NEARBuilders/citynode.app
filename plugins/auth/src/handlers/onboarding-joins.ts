import type { Implementer } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect, Result } from "effect";
import type { ContractType } from "../contract";
import { DatabaseTag } from "../db/layer";
import * as schema from "../db/schema";
import type { createRequireAuth } from "../middleware";
import {
  countOrganizationRedemptions,
  currentMonthWindow,
  monthWindow,
  previousMonthWindow,
  redeemedWithin,
  redemptionCounts,
} from "../onboarding-redemption-counts";
import { AuthApiTag } from "../service-types";
import { toORPCError } from "../utils";
import { requireOrganizerContext } from "./onboarding";
import type { OrganizationRequestContext } from "./organization-requests";

export function createOnboardingJoinHandlers(
  builder: Implementer<ContractType, OrganizationRequestContext>,
  requireAuth: ReturnType<typeof createRequireAuth>,
) {
  return {
    listOnboardingJoins: builder.listOnboardingJoins.use(requireAuth).effect(function* ({
      input,
      context,
      errors,
    }) {
      if (context.user?.role !== "admin") {
        return yield* Effect.fail(errors.FORBIDDEN({ message: "Requires role: admin", data: {} }));
      }
      const services = { auth: (yield* AuthApiTag).auth, db: yield* DatabaseTag };
      const window = monthWindow(input.month, new Date());
      const inMonth = redeemedWithin(window);
      const [organizations, [totals]] = yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            services.db
              .select({ organizationId: schema.onboardingCode.organizationId, ...redemptionCounts })
              .from(schema.onboardingRedemption)
              .innerJoin(
                schema.onboardingCode,
                eq(schema.onboardingRedemption.codeId, schema.onboardingCode.id),
              )
              .where(inMonth)
              .groupBy(schema.onboardingCode.organizationId),
            services.db.select(redemptionCounts).from(schema.onboardingRedemption).where(inMonth),
          ]),
        catch: toORPCError,
      });
      return {
        month: window.month,
        totals: totals ?? { redeemed: 0, newMembers: 0 },
        organizations,
      };
    }),

    getOnboardingRedemptions: builder.getOnboardingRedemptions.use(requireAuth).effect(function* ({
      input,
      context,
      errors,
    }) {
      const services = { auth: (yield* AuthApiTag).auth, db: yield* DatabaseTag };
      const organizer = yield* Effect.result(
        Effect.tryPromise({
          try: () =>
            requireOrganizerContext(
              services,
              context,
              input.organizationId,
              "view code redemptions",
            ),
          catch: toORPCError,
        }),
      );
      if (Result.isFailure(organizer)) {
        const { code, message } = organizer.failure;
        if (code === "UNAUTHORIZED")
          return yield* Effect.fail(
            errors.UNAUTHORIZED({ message, data: { apiKeyProvided: false } }),
          );
        if (code === "FORBIDDEN")
          return yield* Effect.fail(errors.FORBIDDEN({ message, data: {} }));
        if (code === "NOT_FOUND")
          return yield* Effect.fail(errors.NOT_FOUND({ message, data: {} }));
        if (code === "BAD_REQUEST")
          return yield* Effect.fail(errors.BAD_REQUEST({ message, data: {} }));
        return yield* Effect.die(organizer.failure);
      }
      const { organizationId } = organizer.success;
      const now = new Date();
      const [thisMonth, lastMonth] = yield* Effect.tryPromise(() =>
        Promise.all([
          countOrganizationRedemptions(services.db, organizationId, currentMonthWindow(now)),
          countOrganizationRedemptions(services.db, organizationId, previousMonthWindow(now)),
        ]),
      ).pipe(Effect.orDie);
      return { thisMonth, lastMonth };
    }),
  };
}

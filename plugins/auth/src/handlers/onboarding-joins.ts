import type { Implementer } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { ContractType } from "../contract";
import * as schema from "../db/schema";
import type { createRequireAuth } from "../middleware";
import {
  countOrganizationRedemptions,
  monthWindow,
  redeemedWithin,
  redemptionCounts,
} from "../onboarding-redemption-counts";
import { AuthServicesTag } from "../service-types";
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
        return yield* Effect.fail(errors.FORBIDDEN({ message: "Requires role: admin" }));
      }
      const services = yield* AuthServicesTag;
      const window = monthWindow(input.month);
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
      const services = yield* AuthServicesTag;
      const { organizationId } = yield* Effect.tryPromise({
        try: () => requireOrganizerContext(services, context, input.organizationId),
        catch: (error) => {
          const failure = toORPCError(error);
          if (failure.code === "FORBIDDEN") return errors.FORBIDDEN({ message: failure.message });
          if (failure.code === "BAD_REQUEST") {
            return errors.BAD_REQUEST({ message: failure.message });
          }
          return failure;
        },
      });
      const [thisMonth, lastMonth] = yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            countOrganizationRedemptions(services.db, organizationId, monthWindow()),
            countOrganizationRedemptions(services.db, organizationId, monthWindow(undefined, -1)),
          ]),
        catch: toORPCError,
      });
      return { thisMonth, lastMonth };
    }),
  };
}

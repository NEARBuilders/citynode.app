import type { Implementer } from "@orpc/server";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { ContractType } from "../contract";
import * as schema from "../db/schema";
import type { createRequireAuth } from "../middleware";
import { AuthServicesTag } from "../service-types";
import { toORPCError } from "../utils";
import type { OrganizationRequestContext } from "./organization-requests";

function monthWindow(month: string | undefined) {
  const now = new Date();
  const [year, monthIndex] = month
    ? [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
    : [now.getUTCFullYear(), now.getUTCMonth()];
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { month: start.toISOString().slice(0, 7), start, end };
}

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
      const { month, start, end } = monthWindow(input.month);
      const inMonth = and(
        gte(schema.onboardingRedemption.createdAt, start),
        lt(schema.onboardingRedemption.createdAt, end),
      );
      const counts = {
        redeemed: sql<number>`count(distinct ${schema.onboardingRedemption.userId})::int`,
        newMembers: sql<number>`(count(distinct ${schema.onboardingRedemption.userId}) filter (where ${schema.onboardingRedemption.newMember}))::int`,
      };
      const [organizations, [totals]] = yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            services.db
              .select({ organizationId: schema.onboardingCode.organizationId, ...counts })
              .from(schema.onboardingRedemption)
              .innerJoin(
                schema.onboardingCode,
                eq(schema.onboardingRedemption.codeId, schema.onboardingCode.id),
              )
              .where(inMonth)
              .groupBy(schema.onboardingCode.organizationId),
            services.db.select(counts).from(schema.onboardingRedemption).where(inMonth),
          ]),
        catch: toORPCError,
      });
      return { month, totals: totals ?? { redeemed: 0, newMembers: 0 }, organizations };
    }),
  };
}

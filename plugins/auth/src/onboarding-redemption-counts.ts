import { and, eq, gte, lt, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import type { PluginServices } from "./service-types";

export type MonthWindow = { month: string; start: Date; end: Date };

export function monthWindow(month?: string, offset = 0): MonthWindow {
  const now = new Date();
  const [year, monthIndex] = month
    ? [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
    : [now.getUTCFullYear(), now.getUTCMonth()];
  const start = new Date(Date.UTC(year, monthIndex + offset, 1));
  const end = new Date(Date.UTC(year, monthIndex + offset + 1, 1));
  return { month: start.toISOString().slice(0, 7), start, end };
}

export function redeemedWithin(window: MonthWindow) {
  return and(
    gte(schema.onboardingRedemption.createdAt, window.start),
    lt(schema.onboardingRedemption.createdAt, window.end),
  );
}

export const redemptionCounts = {
  redeemed: sql<number>`count(distinct ${schema.onboardingRedemption.userId})::int`,
  newMembers: sql<number>`(count(distinct ${schema.onboardingRedemption.userId}) filter (where ${schema.onboardingRedemption.newMember}))::int`,
};

export async function countOrganizationRedemptions(
  db: PluginServices["db"],
  organizationId: string,
  window: MonthWindow,
) {
  const [counts] = await db
    .select(redemptionCounts)
    .from(schema.onboardingRedemption)
    .innerJoin(
      schema.onboardingCode,
      eq(schema.onboardingRedemption.codeId, schema.onboardingCode.id),
    )
    .where(and(redeemedWithin(window), eq(schema.onboardingCode.organizationId, organizationId)));
  return {
    month: window.month,
    redeemed: counts?.redeemed ?? 0,
    newMembers: counts?.newMembers ?? 0,
  };
}

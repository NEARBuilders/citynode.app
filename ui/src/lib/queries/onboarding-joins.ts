import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@/app";

export const onboardingJoinQueryKeys = {
  all: ["admin", "onboarding-joins"] as const,
  month: (month: string) => [...onboardingJoinQueryKeys.all, month] as const,
};

export function utcMonth(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export function recentUtcMonths(count: number) {
  return Array.from({ length: count }, (_, index) => utcMonth(index - count + 1));
}

export function onboardingJoinsQueryOptions(apiClient: ApiClient, month: string) {
  return queryOptions({
    queryKey: onboardingJoinQueryKeys.month(month),
    queryFn: () => apiClient.auth.getOnboardingStats({ month }),
    staleTime: 30 * 1000,
  });
}

export function onboardingRedemptionsQueryOptions(apiClient: ApiClient, organizationId: string) {
  return queryOptions({
    queryKey: ["onboarding-redemptions", organizationId] as const,
    queryFn: async () => {
      const [thisMonth, lastMonth] = await Promise.all([
        apiClient.auth.getOnboardingStats({ month: utcMonth(0), organizationId }),
        apiClient.auth.getOnboardingStats({ month: utcMonth(-1), organizationId }),
      ]);
      return {
        thisMonth: {
          month: thisMonth.month,
          redeemed: thisMonth.totals.redeemed,
          newMembers: thisMonth.totals.newMembers,
        },
        lastMonth: {
          month: lastMonth.month,
          redeemed: lastMonth.totals.redeemed,
          newMembers: lastMonth.totals.newMembers,
        },
      };
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

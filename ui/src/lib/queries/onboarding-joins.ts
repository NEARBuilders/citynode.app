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

export function onboardingJoinsQueryOptions(apiClient: ApiClient, month: string) {
  return queryOptions({
    queryKey: onboardingJoinQueryKeys.month(month),
    queryFn: () => apiClient.auth.listOnboardingJoins({ month }),
    staleTime: 30 * 1000,
  });
}

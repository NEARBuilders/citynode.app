import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "@/lib/auth";

export async function clearAuthenticatedQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData(sessionQueryKey, null);
}

export function resolveSessionFromCache<T>(
  queryClient: QueryClient | undefined,
  contextSession: T | null | undefined,
): T | null | undefined {
  if (!queryClient) return contextSession;

  const cachedSession = queryClient.getQueryData<T | null>(sessionQueryKey);
  if (cachedSession !== undefined) return cachedSession;

  if (contextSession !== undefined) {
    queryClient.setQueryData(sessionQueryKey, contextSession);
  }
  return contextSession;
}

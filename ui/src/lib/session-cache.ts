import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "@/lib/auth";

export async function clearAuthenticatedQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData(sessionQueryKey, null);
}

/**
 * Resolves the session for the root route: the query cache wins (it is kept
 * authoritative by the single sessionQueryOptions read path), and a populated
 * router-context session — the host's SSR resolution — seeds an empty cache so
 * the dehydrated state carries it to the client.
 */
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

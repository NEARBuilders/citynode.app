import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "everything-dev/ui/auth";

const consumedBootstrapClients = new WeakSet<QueryClient>();

export async function clearAuthenticatedQueries(queryClient: QueryClient) {
  consumedBootstrapClients.add(queryClient);
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
  if (cachedSession !== undefined) {
    consumedBootstrapClients.add(queryClient);
    return cachedSession;
  }
  if (consumedBootstrapClients.has(queryClient)) return undefined;

  consumedBootstrapClients.add(queryClient);
  if (contextSession !== undefined) {
    queryClient.setQueryData(sessionQueryKey, contextSession);
  }
  return contextSession;
}

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearAuthenticatedQueries, sessionQueryKey } from "@/lib/auth";
import { resolveSessionFromCache } from "./session-cache";

describe("session cache boundaries", () => {
  it("prefers the query cache over the router context session", () => {
    const queryClient = new QueryClient();
    const currentSession = { user: { id: "current-user" } };

    queryClient.setQueryData(sessionQueryKey, currentSession);
    expect(resolveSessionFromCache(queryClient, { user: { id: "stale-user" } })).toBe(
      currentSession,
    );

    queryClient.setQueryData(sessionQueryKey, null);
    expect(resolveSessionFromCache(queryClient, currentSession)).toBeNull();
  });

  it("seeds an empty cache from the router context session (SSR dehydration)", () => {
    const queryClient = new QueryClient();
    const contextSession = { user: { id: "context-user" } };
    expect(resolveSessionFromCache(queryClient, contextSession)).toBe(contextSession);
    expect(queryClient.getQueryData(sessionQueryKey)).toBe(contextSession);
  });

  it("keeps the signed-out cache entry ahead of a late context session", async () => {
    const queryClient = new QueryClient();
    const staleSession = { user: { id: "stale-user" } };

    await clearAuthenticatedQueries(queryClient);
    expect(resolveSessionFromCache(queryClient, staleSession)).toBeNull();
  });
});

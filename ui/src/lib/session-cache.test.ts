import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { sessionQueryKey } from "@/lib/auth";
import { clearAuthenticatedQueries, resolveSessionFromCache } from "./session-cache";

describe("session cache boundaries", () => {
  it("clears private and public query data while preserving an explicit signed-out session", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionQueryKey, { user: { id: "user-1" } });
    queryClient.setQueryData(["private-data"], { secret: true });
    queryClient.setQueryData(["public-data"], { title: "City Node" });

    await clearAuthenticatedQueries(queryClient);

    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull();
    expect(queryClient.getQueryData(["private-data"])).toBeUndefined();
    expect(queryClient.getQueryData(["public-data"])).toBeUndefined();
  });

  it("prefers an explicit cached session over stale router context", () => {
    const queryClient = new QueryClient();
    const currentSession = { user: { id: "current-user" } };

    queryClient.setQueryData(sessionQueryKey, currentSession);
    expect(resolveSessionFromCache(queryClient, { user: { id: "stale-user" } })).toBe(
      currentSession,
    );

    queryClient.setQueryData(sessionQueryKey, null);
    expect(resolveSessionFromCache(queryClient, currentSession)).toBeNull();

    queryClient.clear();
    expect(resolveSessionFromCache(queryClient, currentSession)).toBeUndefined();
  });

  it("seeds the initial router context once for the client query cache", () => {
    const queryClient = new QueryClient();
    const contextSession = { user: { id: "context-user" } };
    expect(resolveSessionFromCache(queryClient, contextSession)).toBe(contextSession);
    expect(queryClient.getQueryData(sessionQueryKey)).toBe(contextSession);

    queryClient.clear();
    expect(resolveSessionFromCache(queryClient, contextSession)).toBeUndefined();
  });

  it("keeps logout ahead of a late bootstrap resolver", async () => {
    const queryClient = new QueryClient();
    const staleSession = { user: { id: "stale-user" } };

    await clearAuthenticatedQueries(queryClient);
    expect(resolveSessionFromCache(queryClient, staleSession)).toBeNull();

    queryClient.clear();
    expect(resolveSessionFromCache(queryClient, staleSession)).toBeUndefined();
  });
});

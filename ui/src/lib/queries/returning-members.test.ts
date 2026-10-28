import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { ONBOARDING_CODE_LIST_LIMIT } from "@/lib/returning-members";
import {
  readReturningMembers,
  returningMembersQueryKeys,
  returningMembersQueryOptions,
} from "./returning-members";

type Code = { id: string; eventId: string | null };

function fakeUpstream({
  events,
  codes,
  joined,
}: {
  events: Record<string, Array<{ id: string; kind: "event" | "social" }>>;
  codes: Code[];
  joined: Record<string, string[]>;
}) {
  const listDiscoveryActivities = vi.fn(async ({ nodeId }: { nodeId: string }) => {
    const activities = events[nodeId];
    if (!activities) throw new Error(`unknown node ${nodeId}`);
    return activities;
  });
  const listOnboardingCodes = vi.fn(async ({ eventId }: { eventId?: string }) =>
    codes.filter((code) => code.eventId === eventId).slice(0, ONBOARDING_CODE_LIST_LIMIT),
  );
  const getOnboardingStatus = vi.fn(async ({ codeId }: { codeId: string }) => {
    const users = joined[codeId];
    if (!users) throw new Error(`status failed for ${codeId}`);
    return { joined: users.map((userId) => ({ userId })) };
  });
  const apiClient = {
    listDiscoveryActivities,
    auth: { listOnboardingCodes, getOnboardingStatus },
  } as unknown as ApiClient;
  return { apiClient, listDiscoveryActivities, listOnboardingCodes, getOnboardingStatus };
}

const now = () => new Date("2026-10-28T10:00:00.000Z");

describe("readReturningMembers", () => {
  it("reads every node's events and lists codes per event in the organizer's organization", async () => {
    const upstream = fakeUpstream({
      events: {
        "node-city": [
          { id: "event-a", kind: "event" },
          { id: "post-1", kind: "social" },
        ],
        "node-district": [{ id: "event-b", kind: "event" }],
      },
      codes: [
        { id: "code-a", eventId: "event-a" },
        { id: "code-b", eventId: "event-b" },
      ],
      joined: { "code-a": ["user-1", "user-2"], "code-b": ["user-1"] },
    });

    const result = await readReturningMembers(
      upstream.apiClient,
      "org-1",
      ["node-city", "node-district"],
      now,
    );

    expect(result).toEqual({
      kind: "ready",
      returning: 1,
      total: 2,
      mayBeIncomplete: false,
      readAt: "2026-10-28T10:00:00.000Z",
    });
    expect(upstream.listOnboardingCodes.mock.calls.map(([input]) => input)).toEqual([
      { organizationId: "org-1", eventId: "event-a" },
      { organizationId: "org-1", eventId: "event-b" },
    ]);
    expect(upstream.getOnboardingStatus).toHaveBeenCalledWith({
      codeId: "code-a",
      organizationId: "org-1",
    });
  });

  it("reads past the per-query code cap by listing each event separately", async () => {
    const eventIds = ["event-a", "event-b", "event-c"];
    const codes = eventIds.flatMap((eventId) =>
      Array.from({ length: 8 }, (_, index) => ({ id: `${eventId}-${index}`, eventId })),
    );
    const upstream = fakeUpstream({
      events: { "node-city": eventIds.map((id) => ({ id, kind: "event" as const })) },
      codes,
      joined: Object.fromEntries(codes.map((code, index) => [code.id, [`user-${index % 10}`]])),
    });

    const result = await readReturningMembers(upstream.apiClient, "org-1", ["node-city"], now);

    expect(codes.length).toBeGreaterThan(ONBOARDING_CODE_LIST_LIMIT);
    expect(upstream.getOnboardingStatus).toHaveBeenCalledTimes(24);
    expect(result).toMatchObject({ kind: "ready", total: 10, mayBeIncomplete: false });
  });

  it("labels the result incomplete when one event returns exactly the cap", async () => {
    const codes = Array.from({ length: ONBOARDING_CODE_LIST_LIMIT }, (_, index) => ({
      id: `code-${index}`,
      eventId: "event-a",
    }));
    const upstream = fakeUpstream({
      events: { "node-city": [{ id: "event-a", kind: "event" }] },
      codes,
      joined: Object.fromEntries(codes.map((code) => [code.id, ["user-1"]])),
    });

    await expect(
      readReturningMembers(upstream.apiClient, "org-1", ["node-city"], now),
    ).resolves.toMatchObject({ kind: "ready", returning: 0, total: 1, mayBeIncomplete: true });
  });

  it("fails as a whole when any read fails, never returning a partial count", async () => {
    const upstream = fakeUpstream({
      events: { "node-city": [{ id: "event-a", kind: "event" }] },
      codes: [
        { id: "code-a", eventId: "event-a" },
        { id: "code-broken", eventId: "event-a" },
      ],
      joined: { "code-a": ["user-1"] },
    });

    await expect(
      readReturningMembers(upstream.apiClient, "org-1", ["node-city"], now),
    ).rejects.toThrow("status failed for code-broken");
  });

  it("keeps each organization's value in its own cache entry", async () => {
    const first = fakeUpstream({
      events: { "node-a": [{ id: "event-a", kind: "event" }] },
      codes: [{ id: "code-a", eventId: "event-a" }],
      joined: { "code-a": ["user-1"] },
    });
    const second = fakeUpstream({
      events: { "node-b": [{ id: "event-b", kind: "event" }] },
      codes: [],
      joined: {},
    });
    const queryClient = new QueryClient();

    const firstResult = await queryClient.fetchQuery(
      returningMembersQueryOptions(first.apiClient, "org-a", ["node-a"]),
    );
    const secondResult = await queryClient.fetchQuery(
      returningMembersQueryOptions(second.apiClient, "org-b", ["node-b"]),
    );

    expect(firstResult).toMatchObject({ kind: "ready", total: 1 });
    expect(secondResult).toEqual({ kind: "no-codes" });
    expect(returningMembersQueryKeys.organization("org-a", ["node-a"])).not.toEqual(
      returningMembersQueryKeys.organization("org-b", ["node-b"]),
    );
    await queryClient.fetchQuery(
      returningMembersQueryOptions(first.apiClient, "org-a", ["node-a"]),
    );
    expect(first.listDiscoveryActivities).toHaveBeenCalledTimes(1);
  });
});

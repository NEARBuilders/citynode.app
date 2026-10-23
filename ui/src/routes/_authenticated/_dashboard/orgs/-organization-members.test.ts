import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { orgMembersQueryOptions } from "./-organization-members";

vi.mock("@/app", () => ({
  useApiClient: () => null,
}));

describe("orgMembersQueryOptions", () => {
  it("loads members through the auth plugin, which decides who sees email addresses", async () => {
    const members = [
      {
        id: "member-1",
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        user: { id: "user-1", name: "Rui", email: null, image: null },
      },
    ];
    const listMembers = vi.fn(async () => ({ members, total: 1 }));
    const apiClient = { auth: { listMembers } } as unknown as ApiClient;

    const result = await new QueryClient().fetchQuery(orgMembersQueryOptions(apiClient, "org-1"));

    expect(listMembers).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(result).toEqual(members);
  });
});

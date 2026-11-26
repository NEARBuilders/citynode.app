import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { orgMembersQueryOptions } from "./-organization-members";

vi.mock("@/app", () => ({ useAuthClient: vi.fn() }));

const clients: QueryClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

function members(count: number, from = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${from + index}`,
    userId: `u${from + index}`,
    role: "member",
  }));
}

function fetchMembers(listMembers: ReturnType<typeof vi.fn>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const apiClient = { auth: { listMembers } } as unknown as ApiClient;
  return queryClient.fetchQuery(orgMembersQueryOptions(apiClient, "org-1"));
}

describe("orgMembersQueryOptions", () => {
  it("reads the member list in pages of 100 until the last one", async () => {
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({ members: members(100), total: 130 })
      .mockResolvedValueOnce({ members: members(30, 100), total: 130 });

    const result = await fetchMembers(listMembers);

    expect(result).toHaveLength(130);
    expect(listMembers).toHaveBeenNthCalledWith(1, {
      organizationId: "org-1",
      limit: 100,
      offset: 0,
    });
    expect(listMembers).toHaveBeenNthCalledWith(2, {
      organizationId: "org-1",
      limit: 100,
      offset: 100,
    });
  });

  it("stops once the total is reached on a full page", async () => {
    const listMembers = vi.fn().mockResolvedValue({ members: members(100), total: 100 });

    await expect(fetchMembers(listMembers)).resolves.toHaveLength(100);
    expect(listMembers).toHaveBeenCalledOnce();
  });

  it("stops on an empty page even when the total says more", async () => {
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({ members: members(100), total: 500 })
      .mockResolvedValueOnce({ members: [], total: 500 });

    await expect(fetchMembers(listMembers)).resolves.toHaveLength(100);
    expect(listMembers).toHaveBeenCalledTimes(2);
  });

  it("keeps one entry per member when pages overlap", async () => {
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({ members: members(100), total: 150 })
      .mockResolvedValueOnce({ members: members(50, 99), total: 150 });

    const result = await fetchMembers(listMembers);

    expect(result).toHaveLength(149);
    expect(new Set(result.map((member) => member.id)).size).toBe(149);
  });
});

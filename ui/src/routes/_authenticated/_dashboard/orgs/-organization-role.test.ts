import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { orgActiveRoleQueryOptions } from "./-organization-members";

vi.mock("@/app", () => ({ useAuthClient: vi.fn() }));

const clients: QueryClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

function fetchRole(getActiveMemberRole: ReturnType<typeof vi.fn>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const apiClient = { auth: { getActiveMemberRole } } as unknown as ApiClient;
  return queryClient.fetchQuery(orgActiveRoleQueryOptions(apiClient, "org-1"));
}

describe("orgActiveRoleQueryOptions", () => {
  it("asks for the caller's own role in the target organization", async () => {
    const getActiveMemberRole = vi.fn().mockResolvedValue({ role: "admin" });
    await expect(fetchRole(getActiveMemberRole)).resolves.toBe("admin");
    expect(getActiveMemberRole).toHaveBeenCalledWith({ organizationId: "org-1" });
  });

  it("treats a caller who isn't a member as having no role", async () => {
    const getActiveMemberRole = vi.fn().mockRejectedValue({ code: "FORBIDDEN", status: 403 });
    await expect(fetchRole(getActiveMemberRole)).resolves.toBeNull();
  });

  it("surfaces other failures so the page can offer a retry", async () => {
    const getActiveMemberRole = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchRole(getActiveMemberRole)).rejects.toThrow("network down");
  });
});

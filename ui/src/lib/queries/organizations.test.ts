import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { organizationByIdQueryOptions, organizationQueryKeys } from "./organizations";

describe("organization query helpers", () => {
  it("loads an organization by id through the admin endpoint", async () => {
    const getOrganizationForAdmin = vi.fn().mockResolvedValue({
      id: "org-2",
      name: "City Node",
      slug: "city-node",
      logo: null,
      metadata: null,
    });
    const apiClient = { auth: { getOrganizationForAdmin } } as unknown as ApiClient;
    const queryClient = new QueryClient();

    const organization = await queryClient.fetchQuery(
      organizationByIdQueryOptions(apiClient, "org-2"),
    );

    expect(organizationQueryKeys.byId("org-2")).toEqual(["organizations", "detail", "org-2"]);
    expect(getOrganizationForAdmin).toHaveBeenCalledWith({ organizationId: "org-2" });
    expect(organization?.slug).toBe("city-node");
  });
});

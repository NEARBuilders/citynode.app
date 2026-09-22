import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { loadTenantWizardParents } from "./-tenant-wizard-loader";

describe("tenant wizard loader", () => {
  it("skips parent loading without an active organization", async () => {
    const ensureQueryData = vi.fn();

    await loadTenantWizardParents({
      activeOrganizationId: null,
      apiClient: {} as ApiClient,
      queryClient: { ensureQueryData } as unknown as QueryClient,
    });

    expect(ensureQueryData).not.toHaveBeenCalled();
  });

  it("ensures root parents before rendering for an active organization", async () => {
    const ensureQueryData = vi.fn().mockResolvedValue([]);

    await loadTenantWizardParents({
      activeOrganizationId: "org-1",
      apiClient: {} as ApiClient,
      queryClient: { ensureQueryData } as unknown as QueryClient,
    });

    expect(ensureQueryData).toHaveBeenCalledOnce();
    expect(ensureQueryData).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: nodeQueryKeys.roots() }),
    );
  });
});

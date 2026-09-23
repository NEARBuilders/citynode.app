import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { loadNodeApplicationParents } from "./-apply-loader";

describe("node application loader", () => {
  it("returns root nodes from the shared query factory", async () => {
    const roots = [{ id: "country-id" }];
    const ensureQueryData = vi.fn().mockResolvedValue(roots);

    const result = await loadNodeApplicationParents({
      apiClient: {} as ApiClient,
      queryClient: { ensureQueryData } as unknown as QueryClient,
    });

    expect(result).toBe(roots);
    expect(ensureQueryData).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: nodeQueryKeys.roots() }),
    );
  });
});

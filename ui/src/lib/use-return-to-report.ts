import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { reportCommunitiesQueryOptions } from "@/lib/queries/monthly-reports";

export function useReturnToReport() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (match: { nodeId?: string; organizationId?: string | null }) => {
    const listed = await queryClient
      .fetchQuery(reportCommunitiesQueryOptions(apiClient))
      .catch(() => null);
    const community = listed?.communities.find(
      (item) =>
        (!!match.nodeId && item.nodeIds.includes(match.nodeId)) ||
        (!!match.organizationId && item.organizationId === match.organizationId),
    );
    await navigate({ to: "/report", search: community ? { community: community.slug } : {} });
  };
}

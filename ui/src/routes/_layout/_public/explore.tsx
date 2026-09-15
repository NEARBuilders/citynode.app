import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useApiClient } from "@/app";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";
import { PageContainer } from "@/components/layout/page-container";
export const Route = createFileRoute("/_layout/_public/explore")({
  validateSearch: z.object({
    node: z.uuid().optional().catch(undefined),
    query: z.string().max(120).optional().catch(undefined),
    region: z.string().max(120).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Explore City Nodes" }] }),
  component: Explore,
});
function Explore() {
  const api = useApiClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PageContainer>
      <DiscoveryExplorer
        api={api}
        search={search}
        navigate={(next) => navigate({ search: next })}
      />
    </PageContainer>
  );
}

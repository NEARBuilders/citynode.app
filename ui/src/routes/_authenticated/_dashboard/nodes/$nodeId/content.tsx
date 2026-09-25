import { ArrowLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { ProfileEditor } from "@/components/discovery/profile-editor";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/content")({
  component: CommunityContent,
});
function CommunityContent() {
  const { nodeId } = Route.useParams();
  const api = useApiClient();
  const node = useQuery({
    queryKey: ["content-node", nodeId],
    queryFn: () => api.getNode({ nodeId }),
  });
  return (
    <PageContainer variant="wide">
      <div className="mx-auto flex max-w-3xl flex-col gap-7">
        <Link
          to="/dashboard/node"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          My community
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Community editor
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {node.data?.name ?? "Your community"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell people who you are and what’s coming up.
            </p>
          </div>
          <Link
            to="/explore"
            search={{ node: nodeId }}
            className="inline-flex items-center gap-1 text-sm font-medium"
          >
            View on Explore <ArrowUpRightIcon className="size-4" />
          </Link>
        </header>
        <ProfileEditor nodeId={nodeId} defaultTab="events" />
      </div>
    </PageContainer>
  );
}

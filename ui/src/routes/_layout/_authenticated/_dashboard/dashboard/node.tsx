import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ExternalLink, FileCheck2, Network, PanelTop } from "lucide-react";
import { getActiveRuntime } from "@/app";
import { Badge, Button, EmptyState, PageContainer, PageHeader } from "@/components";
import { cn } from "@/lib/utils";
import { hasNodeProposalReviewPermission } from "./node/node-access";

type NodeDashboardSearch = { nodeId?: string };

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/dashboard/node")({
  validateSearch: (search: Record<string, unknown>): NodeDashboardSearch => ({
    nodeId: typeof search.nodeId === "string" ? search.nodeId : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const activeOrganizationId = context.auth.activeOrganizationId;
    if (!activeOrganizationId) {
      return {
        tenant: null,
        nodes: [],
        selectedNode: null,
        summary: null,
        stakingSourceNode: null,
        canReview: false,
        emptyReason: "no-org" as const,
      };
    }

    const tenant = await context.apiClient
      .resolveTenantByOrgId({ orgId: activeOrganizationId })
      .catch(() => null);
    if (!tenant) {
      return {
        tenant: null,
        nodes: [],
        selectedNode: null,
        summary: null,
        stakingSourceNode: null,
        canReview: false,
        emptyReason: "no-tenant" as const,
      };
    }

    const nodes = (await context.apiClient.listNodes({ tenantId: tenant.id })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const selectedNode = nodes.find((node) => node.id === search.nodeId) ?? nodes[0] ?? null;
    if (!selectedNode) {
      return {
        tenant,
        nodes,
        selectedNode: null,
        summary: null,
        stakingSourceNode: null,
        canReview: false,
        emptyReason: "no-node" as const,
      };
    }

    const summary = await context.apiClient.getNodeSummary({ nodeId: selectedNode.id });
    const stakingSourceNode =
      summary.stakingValidators.sourceNodeId === selectedNode.id
        ? selectedNode
        : await context.apiClient.getNode({
            nodeId: summary.stakingValidators.sourceNodeId,
          });

    const canReview = hasNodeProposalReviewPermission(context.auth.user?.role);

    return {
      tenant,
      nodes,
      selectedNode,
      summary,
      stakingSourceNode,
      canReview,
      emptyReason: null,
    };
  },
  head: () => ({
    meta: [
      { title: "My Node | app" },
      { name: "description", content: "Manage your organization's City Node." },
    ],
  }),
  component: NodeDashboardLayout,
});

function NodeDashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { runtimeConfig, nodes, selectedNode, summary, emptyReason } = Route.useRouteContext();
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;

  if (!selectedNode || !summary) {
    const description =
      emptyReason === "no-org"
        ? "Join or create an organization to manage a City Node."
        : emptyReason === "no-tenant"
          ? "Your active organization does not have a tenant deployment yet."
          : "Your active organization's tenant does not manage a City Node yet.";
    return (
      <PageContainer variant="wide">
        <EmptyState
          icon={Network}
          title="No node available"
          description={description}
          action={
            <Button asChild>
              <Link to="/orgs">open organizations</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const gatewayUrl = gateway ? `https://${selectedNode.slug}.${gateway}` : null;
  const isSummary = pathname === "/dashboard/node" || pathname === "/dashboard/node/";

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          icon={Network}
          label="My Node"
          title={selectedNode.name}
          subtitle={selectedNode.slug}
          actions={
            <>
              {nodes.length > 1 && (
                <label className="sr-only" htmlFor="managed-node">
                  Managed node
                </label>
              )}
              {nodes.length > 1 && (
                <select
                  id="managed-node"
                  value={selectedNode.id}
                  onChange={(event) =>
                    navigate({
                      to: "/dashboard/node",
                      search: { nodeId: event.target.value },
                    })
                  }
                  className="h-9 rounded-[8px] border-2 border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              )}
              {gatewayUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={gatewayUrl} target="_blank" rel="noopener noreferrer">
                    {selectedNode.slug}.{gateway}
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{selectedNode.kind}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{selectedNode.id}</span>
        </div>

        <nav className="flex flex-wrap gap-2">
          <Link
            to="/dashboard/node"
            search={{ nodeId: selectedNode.id }}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-[10px] border-2 border-border-strong px-3.5 text-sm font-medium shadow-sm transition-all hover:shadow-md",
              isSummary ? "bg-foreground text-background" : "bg-card text-foreground",
            )}
          >
            <PanelTop className="h-3.5 w-3.5" />
            overview
          </Link>
          <Link
            to="/dashboard/node/proposals"
            search={{ nodeId: selectedNode.id }}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-[10px] border-2 border-border-strong px-3.5 text-sm font-medium shadow-sm transition-all hover:shadow-md",
              pathname.startsWith("/dashboard/node/proposals")
                ? "bg-foreground text-background"
                : "bg-card text-foreground",
            )}
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            proposals
          </Link>
        </nav>

        <Outlet />
      </div>
    </PageContainer>
  );
}

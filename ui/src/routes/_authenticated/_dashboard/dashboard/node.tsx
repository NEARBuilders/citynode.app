import {
  ArrowSquareOutIcon,
  BrowserIcon,
  CalendarDotsIcon,
  NetworkIcon,
  SealCheckIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { getActiveRuntime } from "@/app";
import { Badge, Button, EmptyState, PageContainer, PageHeader } from "@/components";
import { buildTenantUrl } from "@/lib/tenant-url";
import { hasNodeProposalReviewPermission } from "./node/-node-access";
import { getNodeEmptyStateContent } from "./node/-node-empty-state";

type NodeDashboardSearch = { nodeId?: string };

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/node")({
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
  const context = Route.useRouteContext();
  const { runtimeConfig, nodes, selectedNode, summary, emptyReason } = context;
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;

  if (!selectedNode || !summary) {
    const emptyState = getNodeEmptyStateContent(
      emptyReason ?? "no-node",
      context.auth.user?.role === "admin",
    );
    return (
      <PageContainer variant="wide">
        <EmptyState
          icon={NetworkIcon}
          title="No node available"
          description={emptyState.description}
          action={
            <Button nativeButton={false} render={<Link to={emptyState.actionTo} />}>
              {emptyState.actionLabel}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const gatewayUrl = gateway ? buildTenantUrl(selectedNode.slug, gateway) : null;
  const isSummary = pathname === "/dashboard/node" || pathname === "/dashboard/node/";

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          icon={NetworkIcon}
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
                  className="h-11 rounded-4xl border border-input bg-input/30 px-4 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              )}
              {gatewayUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={(props) => (
                    <a {...props} href={gatewayUrl} target="_blank" rel="noopener noreferrer" />
                  )}
                >
                  {selectedNode.slug}.{gateway}
                  <ArrowSquareOutIcon />
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
          <Button
            nativeButton={false}
            render={<Link to="/nodes/$nodeId/content" params={{ nodeId: selectedNode.id }} />}
          >
            <CalendarDotsIcon />
            Events & community profile
          </Button>
          <Button
            variant={isSummary ? "secondary" : "outline"}
            nativeButton={false}
            render={<Link to="/dashboard/node" search={{ nodeId: selectedNode.id }} />}
          >
            <BrowserIcon />
            overview
          </Button>
          <Button
            variant={pathname.startsWith("/dashboard/node/proposals") ? "secondary" : "outline"}
            nativeButton={false}
            render={<Link to="/dashboard/node/proposals" search={{ nodeId: selectedNode.id }} />}
          >
            <SealCheckIcon />
            proposals
          </Button>
        </nav>

        <Outlet />
      </div>
    </PageContainer>
  );
}

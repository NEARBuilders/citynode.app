import { ArrowSquareOutIcon, NetworkIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { getActiveRuntime } from "@/app";
import { Button, EmptyState, PageContainer, PageHeader } from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildTenantUrl } from "@/lib/tenant-url";
import { CommunityNav } from "./node/-community-nav";
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
        canManage: false,
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
        canManage: false,
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
        canManage: false,
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
    const authContext = await context.apiClient.auth.getContext().catch(() => null);
    const orgRole = authContext?.organization?.member?.role;
    const canManage = canReview || orgRole === "owner" || orgRole === "admin";

    return {
      tenant,
      nodes,
      selectedNode,
      summary,
      stakingSourceNode,
      canReview,
      canManage,
      emptyReason: null,
    };
  },
  head: () => ({
    meta: [
      { title: "My community | app" },
      { name: "description", content: "Run your community." },
    ],
  }),
  component: NodeDashboardLayout,
});

function NodeDashboardLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const context = Route.useRouteContext();
  const { runtimeConfig, nodes, selectedNode, summary, emptyReason, tenant, canManage } = context;
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;

  if (!selectedNode || !summary) {
    const emptyState = getNodeEmptyStateContent(
      emptyReason ?? "no-node",
      context.auth.user?.role === "admin",
    );
    return (
      <PageContainer>
        <EmptyState
          icon={NetworkIcon}
          title={emptyState.title}
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
  const active = pathname.startsWith("/dashboard/node/proposals") ? "proposals" : "overview";

  return (
    <PageContainer variant="wide">
      <header className="flex flex-col gap-6">
        <PageHeader
          headerTestId="dashboard-node.heading"
          title={selectedNode.name}
          description={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
              <span className="capitalize">{selectedNode.kind}</span>
              {gatewayUrl && (
                <a
                  href={gatewayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  data-testid="dashboard-node.site-link"
                >
                  {selectedNode.slug}.{gateway}
                  <ArrowSquareOutIcon className="size-4" />
                </a>
              )}
            </span>
          }
          actions={
            nodes.length > 1 ? (
              <Select
                value={selectedNode.id}
                items={nodes.map((node) => ({ label: node.name, value: node.id }))}
                onValueChange={(value) => {
                  if (!value) return;
                  navigate({ to: "/dashboard/node", search: { nodeId: value } });
                }}
              >
                <SelectTrigger id="managed-node" aria-label="Switch community">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          }
        />
        <CommunityNav
          active={active}
          nodeId={selectedNode.id}
          tenantId={tenant?.id}
          canManage={canManage}
        />
      </header>
      <Outlet />
    </PageContainer>
  );
}

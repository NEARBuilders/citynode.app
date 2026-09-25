import { CaretRightIcon, TreeStructureIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Button,
  EmptyState,
  InfoRow,
  NodeValidatorTable,
  PageHeader,
  SectionHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { ProfileEditor } from "@/components/discovery/profile-editor";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { adminNodeDetailQueryOptions } from "@/lib/queries/nodes";
import { BackLink, humanize, RawJsonDisclosure, StatFigure, StatGrid } from "../-admin-ui";
import { NodeBindings } from "./-node-bindings";
import { NODE_DETAIL_TABS, type NodeDetailTab, parseNodeDetailTab } from "./-node-management";
import { NodeMetadataEditor } from "./-node-metadata-editor";
import { NodeValidators } from "./-node-validators";

type ApiClient = ReturnType<typeof useApiClient>;
type NodeSummary = Awaited<ReturnType<ApiClient["getNodeSummary"]>>;

const TAB_LABELS: Record<NodeDetailTab, string> = {
  overview: "Overview",
  validators: "Validators",
  domains: "Domains",
  profile: "Profile",
};

export const Route = createFileRoute("/_admin/_dashboard/admin/nodes/$nodeId")({
  validateSearch: (search: Record<string, unknown>): { tab?: NodeDetailTab } => ({
    tab: parseNodeDetailTab(search.tab),
  }),
  head: () => ({
    meta: [{ title: "Node | Admin | app" }],
  }),
  component: AdminNodeDetail,
});

function AdminNodeDetail() {
  const { nodeId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const nodeQuery = useQuery(adminNodeDetailQueryOptions(apiClient, nodeId));
  const activeTab = tab ?? "overview";

  if (nodeQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (nodeQuery.isError || !nodeQuery.data) {
    return (
      <EmptyState
        icon={TreeStructureIcon}
        title="Couldn't load this node"
        description={nodeQuery.error?.message || "The requested node could not be loaded."}
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/admin/nodes" />}>
            Back to nodes
          </Button>
        }
      />
    );
  }

  const { summary, sourceNode, parent } = nodeQuery.data;
  const { node } = summary;

  return (
    <>
      <PageHeader
        label={<BackLink to="/admin/nodes">Nodes</BackLink>}
        title={node.name}
        subtitle={node.slug}
        description={
          parent ? (
            <>
              {humanize(node.kind)} in{" "}
              <Link
                to="/admin/nodes/$nodeId"
                params={{ nodeId: parent.id }}
                search={{}}
                className="text-foreground hover:underline"
              >
                {parent.name}
              </Link>
            </>
          ) : (
            humanize(node.kind)
          )
        }
        actions={<NodeMetadataEditor key={node.id} node={node} />}
        headerTestId="admin-node.heading"
      />

      <StatGrid>
        <StatFigure label="Direct children" value={summary.childrenCount} />
        <StatFigure label="Nodes below" value={summary.subtreeNodeCount} />
        <StatFigure label="Validators" value={summary.validators.length} />
        <StatFigure label="Validators below" value={summary.subtreeValidatorCount} />
      </StatGrid>

      <div className="flex flex-col gap-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = parseNodeDetailTab(value);
            navigate({ search: { tab: next === "overview" ? undefined : next } });
          }}
        >
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {NODE_DETAIL_TABS.map((value) => (
              <TabsTrigger key={value} value={value} data-testid={`admin-node-tab-${value}`}>
                {TAB_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {activeTab === "overview" && (
          <NodeOverview summary={summary} sourceName={sourceNode?.name} />
        )}
        {activeTab === "validators" && (
          <NodeValidators key={node.id} nodeId={node.id} validators={summary.validators} />
        )}
        {activeTab === "domains" && (
          <NodeBindings
            key={node.tenantId}
            tenantId={node.tenantId}
            gateway={getActiveRuntime(runtimeConfig)?.gatewayId ?? ""}
          />
        )}
        {activeTab === "profile" && <ProfileEditor nodeId={node.id} />}
      </div>
    </>
  );
}

function NodeOverview({ summary, sourceName }: { summary: NodeSummary; sourceName?: string }) {
  const { node } = summary;
  const resolvedElsewhere = summary.stakingValidators.sourceNodeId !== node.id;
  const description =
    typeof node.metadata.description === "string" ? node.metadata.description : null;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-6">
        <SectionHeader
          title="Staking"
          description={
            resolvedElsewhere
              ? `Stakes go to validators on ${sourceName ?? summary.stakingValidators.sourceNodeId}.`
              : "Stakes go to validators on this node or below it."
          }
        />
        {summary.stakingValidators.validators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No validators to stake with yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <NodeValidatorTable validators={summary.stakingValidators.validators} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title="Children" />
        {summary.children.length === 0 ? (
          <p className="text-sm text-muted-foreground">No nodes below this one.</p>
        ) : (
          <ItemGroup>
            {summary.children.map((child) => (
              <Item
                key={child.id}
                variant="outline"
                size="sm"
                render={
                  <Link to="/admin/nodes/$nodeId" params={{ nodeId: child.id }} search={{}} />
                }
              >
                <ItemContent className="min-w-0">
                  <ItemTitle>{child.name}</ItemTitle>
                  <ItemDescription>
                    {humanize(child.kind)} · <span className="font-mono">{child.slug}</span>
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title="Details" />
        {description && <p className="max-w-2xl text-base text-foreground">{description}</p>}
        <div className="flex flex-col">
          <InfoRow label="Node ID" value={node.id} mono />
          <InfoRow label="Tenant ID" value={node.tenantId} mono />
          <InfoRow label="Parent ID" value={node.parentId ?? "None"} mono={!!node.parentId} />
        </div>
        <RawJsonDisclosure value={node.metadata} label="metadata" />
      </section>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Network } from "lucide-react";
import { useMemo } from "react";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoRow,
  NodeValidatorTable,
  SectionHeader,
  Skeleton,
} from "@/components";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { NodeBindings } from "./-node-bindings";
import { NodeMetadataEditor } from "./-node-metadata-editor";
import { NodeValidators } from "./-node-validators";

type ApiClient = ReturnType<typeof useApiClient>;
type NodeSummary = Awaited<ReturnType<ApiClient["getNodeSummary"]>>;
type ChildNode = NodeSummary["children"][number];

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/nodes/$nodeId")({
  head: () => ({
    meta: [{ title: "Node details | app" }],
  }),
  component: AdminNodeDetail,
});

function AdminNodeDetail() {
  const { nodeId } = Route.useParams();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const nodeQuery = useQuery({
    queryKey: ["admin-node", nodeId],
    queryFn: async () => {
      const summary = await apiClient.getNodeSummary({ nodeId });
      const sourceNode =
        summary.stakingValidators.sourceNodeId === nodeId
          ? summary.node
          : await apiClient.getNode({ nodeId: summary.stakingValidators.sourceNodeId });
      const parent = summary.node.parentId
        ? await apiClient.getNode({ nodeId: summary.node.parentId })
        : null;
      return { summary, sourceNode, parent };
    },
    staleTime: 30 * 1000,
  });

  const childColumns = useMemo<DataTableColumnDef<ChildNode>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/admin/nodes/$nodeId"
            params={{ nodeId: row.original.id }}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "kind",
        header: "Kind",
        cell: ({ row }) => <Badge variant="outline">{row.original.kind}</Badge>,
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/nodes/$nodeId" params={{ nodeId: row.original.id }}>
              open
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  if (nodeQuery.isLoading) {
    return (
      <Card className="space-y-3 p-6">
        {[1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </Card>
    );
  }

  if (nodeQuery.isError || !nodeQuery.data) {
    return (
      <EmptyState
        icon={Network}
        title="Failed to load node"
        description={nodeQuery.error?.message || "The requested node could not be loaded."}
        action={
          <Button asChild variant="outline">
            <Link to="/admin/nodes">back to nodes</Link>
          </Button>
        }
      />
    );
  }

  const { summary, sourceNode, parent } = nodeQuery.data;
  const { node } = summary;
  const stakingIsResolvedElsewhere = summary.stakingValidators.sourceNodeId !== node.id;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/nodes">
            <ArrowLeft />
            all nodes
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-foreground">{node.name}</h2>
            <p className="font-mono text-xs text-muted-foreground">{node.slug}</p>
            {parent && (
              <p className="text-sm text-muted-foreground">
                Parent:{" "}
                <Link
                  to="/admin/nodes/$nodeId"
                  params={{ nodeId: parent.id }}
                  className="text-foreground hover:underline"
                >
                  {parent.name}
                </Link>
              </p>
            )}
          </div>
          <Badge variant="outline">{node.kind}</Badge>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Direct children" value={summary.childrenCount} />
        <StatCard label="Subtree nodes" value={summary.subtreeNodeCount} />
        <StatCard label="Validators" value={summary.validators.length} />
        <StatCard label="Subtree validators" value={summary.subtreeValidatorCount} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Node information"
          action={<NodeMetadataEditor key={node.id} node={node} />}
        />
        <Card className="space-y-3 p-6">
          <InfoRow label="id" value={node.id} mono />
          <InfoRow label="tenant" value={node.tenantId} mono />
          <InfoRow label="parent" value={node.parentId ?? "root node"} mono={!!node.parentId} />
          <InfoRow label="kind" value={node.kind} />
          <InfoRow label="slug" value={node.slug} mono />
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Metadata
            </p>
            <pre className="max-h-72 overflow-auto rounded-[8px] border border-border bg-muted/40 p-4 text-xs text-foreground">
              {JSON.stringify(node.metadata, null, 2)}
            </pre>
          </div>
        </Card>
      </section>

      <NodeValidators key={node.id} nodeId={node.id} validators={summary.validators} />

      <NodeBindings
        key={node.tenantId}
        tenantId={node.tenantId}
        gateway={getActiveRuntime(runtimeConfig)?.gatewayId ?? ""}
      />

      <section className="space-y-3">
        <SectionHeader title="Direct children" />
        {summary.children.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No direct children.</Card>
        ) : (
          <div className="overflow-x-auto">
            <DataTable columns={childColumns} data={summary.children} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Staking resolution" />
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stakingIsResolvedElsewhere ? "secondary" : "default"}>
              {stakingIsResolvedElsewhere ? "resolved from another node" : "this node"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {stakingIsResolvedElsewhere
                ? `Staking resolves to ${sourceNode?.name ?? summary.stakingValidators.sourceNodeId}.`
                : "Staking resolves to validators on this node or its subtree."}
            </p>
          </div>
          {summary.stakingValidators.validators.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staking validators are available.</p>
          ) : (
            <div className="-mx-6 -mb-6 border-t border-border">
              <NodeValidatorTable validators={summary.stakingValidators.validators} />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="space-y-1 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

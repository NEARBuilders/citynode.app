import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Network } from "lucide-react";
import { useMemo } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, Card, EmptyState, SectionHeader, Skeleton } from "@/components";
import { DataTable } from "@/components/ui/data-table";

type ApiClient = ReturnType<typeof useApiClient>;
type Node = Awaited<ReturnType<ApiClient["listRootNodes"]>>[number];

interface RootNodeRow {
  node: Node;
  childrenCount: number;
  validatorCount: number;
}

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/nodes/")({
  head: () => ({
    meta: [{ title: "Nodes | app" }],
  }),
  component: AdminNodes,
});

function AdminNodes() {
  const apiClient = useApiClient();
  const nodesQuery = useQuery({
    queryKey: ["admin-nodes"],
    queryFn: async () => {
      const nodes = await apiClient.listRootNodes();
      return (
        await Promise.all(
          nodes.map(async (node): Promise<RootNodeRow> => {
            const summary = await apiClient.getNodeSummary({ nodeId: node.id });
            return {
              node,
              childrenCount: summary.childrenCount,
              validatorCount: summary.validators.length,
            };
          }),
        )
      ).sort((a, b) => a.node.name.localeCompare(b.node.name));
    },
    staleTime: 30 * 1000,
  });

  const columns = useMemo<ColumnDef<RootNodeRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.node.name,
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/admin/nodes/$nodeId"
            params={{ nodeId: row.original.node.id }}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.node.name}
          </Link>
        ),
      },
      {
        id: "kind",
        accessorFn: (row) => row.node.kind,
        header: "Kind",
        cell: ({ row }) => <Badge variant="outline">{row.original.node.kind}</Badge>,
      },
      {
        id: "slug",
        accessorFn: (row) => row.node.slug,
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.node.slug}</span>
        ),
      },
      {
        accessorKey: "validatorCount",
        header: "Validators",
      },
      {
        accessorKey: "childrenCount",
        header: "Children",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/nodes/$nodeId" params={{ nodeId: row.original.node.id }}>
              open
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="Node structure" />

      {nodesQuery.isLoading ? (
        <Card className="space-y-3 p-6">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </Card>
      ) : nodesQuery.isError ? (
        <EmptyState
          icon={Network}
          title="Failed to load nodes"
          description={nodesQuery.error.message || "Something went wrong while loading nodes."}
          action={
            <Button variant="outline" onClick={() => nodesQuery.refetch()}>
              retry
            </Button>
          }
        />
      ) : !nodesQuery.data?.length ? (
        <EmptyState
          icon={Network}
          title="No root nodes"
          description="No top-level nodes have been registered yet."
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={nodesQuery.data} />
        </div>
      )}
    </div>
  );
}

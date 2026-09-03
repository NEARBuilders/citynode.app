import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { useMemo, useState } from "react";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ApiClient = ReturnType<typeof useApiClient>;
type Node = Awaited<ReturnType<ApiClient["listRootNodes"]>>[number];

interface RootNodeRow {
  node: Node;
  parent: Node | undefined;
  status: string;
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
  const [scope, setScope] = useState("roots");
  const [kind, setKind] = useState("all");
  const nodesQuery = useQuery({
    queryKey: ["admin-nodes", scope],
    queryFn: async () => {
      const [allNodes, tenants] = await Promise.all([
        apiClient.listNodes({}),
        apiClient.listTenants(),
      ]);
      const nodes = scope === "roots" ? await apiClient.listRootNodes() : allNodes;
      const parents = new Map(allNodes.map((node) => [node.id, node]));
      const statuses = new Map(tenants.map((tenant) => [tenant.id, tenant.status]));
      return (
        await Promise.all(
          nodes.map(async (node): Promise<RootNodeRow> => {
            const summary = await apiClient.getNodeSummary({ nodeId: node.id });
            return {
              node,
              parent: node.parentId ? parents.get(node.parentId) : undefined,
              status: statuses.get(node.tenantId) ?? "unknown",
              childrenCount: summary.childrenCount,
              validatorCount: summary.validators.length,
            };
          }),
        )
      ).sort((a, b) => a.node.name.localeCompare(b.node.name));
    },
    staleTime: 30 * 1000,
  });

  const columns = useMemo<DataTableColumnDef<RootNodeRow>[]>(
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
        id: "parent",
        accessorFn: (row) => row.parent?.name ?? "Root node",
        header: "Parent",
        cell: ({ row }) =>
          row.original.parent ? (
            <Link
              to="/admin/nodes/$nodeId"
              params={{ nodeId: row.original.parent.id }}
              className="text-foreground hover:underline"
            >
              {row.original.parent.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">Root node</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Tenant status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
            {row.original.status.replaceAll("_", " ")}
          </Badge>
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

  const visibleNodes = (nodesQuery.data ?? []).filter(
    (row) => kind === "all" || row.node.kind === kind,
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="Node structure" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={scope} onValueChange={setScope}>
          <TabsList>
            <TabsTrigger value="roots">Root nodes</TabsTrigger>
            <TabsTrigger value="all">All nodes</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Filter nodes by kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="country">Country</SelectItem>
            <SelectItem value="state">State</SelectItem>
            <SelectItem value="city">City</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
      ) : !visibleNodes.length ? (
        <EmptyState
          icon={Network}
          title="No matching nodes"
          description="No nodes match this view. Try all nodes or a different kind."
        />
      ) : (
        <DataTable columns={columns} data={visibleNodes} />
      )}
    </div>
  );
}

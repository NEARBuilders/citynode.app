import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { useMemo } from "react";
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
import {
  type AdminNodeListKind,
  type AdminNodeListRow,
  type AdminNodeListScope,
  adminNodeListQueryOptions,
} from "@/lib/queries/nodes";

type AdminNodeSearch = {
  scope?: AdminNodeListScope;
  kind?: AdminNodeListKind;
};

const NODE_KIND_VALUES = [
  "all",
  "country",
  "state",
  "city",
] as const satisfies readonly AdminNodeListKind[];

const NODE_KIND_LABELS: Record<AdminNodeListKind, string> = {
  all: "All kinds",
  country: "Country",
  state: "State",
  city: "City",
};

function parseScope(value: unknown): AdminNodeListScope | undefined {
  return value === "roots" || value === "all" ? value : undefined;
}

function parseKind(value: unknown): AdminNodeListKind | undefined {
  return typeof value === "string" && NODE_KIND_VALUES.some((kind) => kind === value)
    ? (value as AdminNodeListKind)
    : undefined;
}

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/nodes/")({
  validateSearch: (search: Record<string, unknown>): AdminNodeSearch => ({
    scope: parseScope(search.scope),
    kind: parseKind(search.kind),
  }),
  loaderDeps: ({ search }) => ({
    scope: search.scope ?? "roots",
    kind: search.kind ?? "all",
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      adminNodeListQueryOptions(context.apiClient, deps.scope, deps.kind),
    ),
  head: () => ({
    meta: [{ title: "Nodes | app" }],
  }),
  component: AdminNodes,
});

function AdminNodes() {
  const apiClient = useApiClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const scope = search.scope ?? "roots";
  const kind = search.kind ?? "all";
  const nodesQuery = useQuery(adminNodeListQueryOptions(apiClient, scope, kind));

  const columns = useMemo<DataTableColumnDef<AdminNodeListRow>[]>(
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

  const visibleNodes = nodesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Node structure" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={scope}
          onValueChange={(value) =>
            navigate({
              search: (previous) => ({
                ...previous,
                scope: value === "all" ? "all" : undefined,
              }),
            })
          }
        >
          <TabsList>
            <TabsTrigger value="roots">Root nodes</TabsTrigger>
            <TabsTrigger value="all">All nodes</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={kind}
          onValueChange={(value) => {
            const nextKind = parseKind(value);
            if (!nextKind) return;
            navigate({
              search: (previous) => ({
                ...previous,
                kind: nextKind === "all" ? undefined : nextKind,
              }),
            });
          }}
        >
          <SelectTrigger aria-label="Filter nodes by kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NODE_KIND_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {NODE_KIND_LABELS[value]}
              </SelectItem>
            ))}
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

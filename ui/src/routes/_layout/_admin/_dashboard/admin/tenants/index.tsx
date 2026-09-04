import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useMemo } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, Card, EmptyState, SectionHeader, Skeleton } from "@/components";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { allNodesQueryOptions } from "@/lib/queries/nodes";
import { tenantsQueryOptions } from "@/lib/queries/tenants";

type ApiClient = ReturnType<typeof useApiClient>;
type Tenant = Awaited<ReturnType<ApiClient["listTenants"]>>[number];

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/tenants/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(tenantsQueryOptions(context.apiClient)),
      context.queryClient.ensureQueryData(allNodesQueryOptions(context.apiClient)),
    ]);
  },
  head: () => ({
    meta: [{ title: "Tenants | app" }],
  }),
  component: AdminTenants,
});

const STATUS_VARIANT: Record<Tenant["status"], "default" | "destructive" | "secondary"> = {
  active: "default",
  pending: "secondary",
  suspended: "destructive",
  pending_deletion: "secondary",
};

function AdminTenants() {
  const apiClient = useApiClient();

  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const nodesQuery = useQuery(allNodesQueryOptions(apiClient));
  const tenants = tenantsQuery.data ?? [];
  const nodes = nodesQuery.data ?? [];
  const isLoading = tenantsQuery.isLoading || nodesQuery.isLoading;
  const error = tenantsQuery.error ?? nodesQuery.error;

  const slugByTenantId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      if (!map.has(node.tenantId)) map.set(node.tenantId, node.slug);
    }
    return map;
  }, [nodes]);

  const tenantKey = (tenantId: string) => slugByTenantId.get(tenantId) ?? tenantId;

  const columns = useMemo<DataTableColumnDef<Tenant>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/tenant/$tenantId"
            params={{ tenantId: tenantKey(row.original.id) }}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "accountId",
        header: "Account",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.accountId}</span>
        ),
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {slugByTenantId.get(row.original.id) ?? row.original.id.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) =>
          row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : "—",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link to="/tenant/$tenantId" params={{ tenantId: tenantKey(row.original.id) }}>
              open
            </Link>
          </Button>
        ),
      },
    ],
    [slugByTenantId],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tenants"
        action={
          <Button asChild>
            <Link to="/admin/tenants/new">
              <Plus size={14} />
              new tenant
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <Card className="p-6 space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </Card>
      ) : error ? (
        <EmptyState
          icon={Building2}
          title="Failed to load tenants"
          description={error.message || "Something went wrong while loading tenants."}
          action={
            <Button
              variant="outline"
              onClick={() => Promise.all([tenantsQuery.refetch(), nodesQuery.refetch()])}
            >
              retry
            </Button>
          }
        />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No tenants yet"
          description="Create your first tenant deployment to get started."
          action={
            <Button asChild>
              <Link to="/admin/tenants/new">
                <Plus size={14} />
                create tenant
              </Link>
            </Button>
          }
        />
      ) : (
        <DataTable columns={columns} data={tenants} />
      )}
    </div>
  );
}

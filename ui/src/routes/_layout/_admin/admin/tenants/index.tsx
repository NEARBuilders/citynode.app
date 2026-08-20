import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { useMemo } from "react";
import { getActiveRuntime, useApiClient } from "@/app";
import { Badge, Button, Card, Skeleton } from "@/components";
import { EmptyState } from "@/components/empty-state";
import { DataTable } from "@/components/ui/data-table";

type ApiClient = ReturnType<typeof useApiClient>;
type Tenant = Awaited<ReturnType<ApiClient["listTenants"]>>[number];

export const Route = createFileRoute("/_layout/_admin/admin/tenants/")({
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
  const gatewayId = getActiveRuntime()?.gatewayId ?? "everything.dev";

  const {
    data: tenants = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => apiClient.listTenants(),
    staleTime: 30 * 1000,
  });

  const columns = useMemo<ColumnDef<Tenant>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/tenant/$tenantId"
            params={{ tenantId: row.original.id }}
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
        accessorKey: "subdomain",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.id.slice(0, 8)}
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
            <Link to="/tenant/$tenantId" params={{ tenantId: row.original.id }}>
              open
            </Link>
          </Button>
        ),
      },
    ],
    [gatewayId],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3 w-3" />
              Tenants
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Tenants
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage tenant deployments for your organization.
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/tenants/new">
              <Plus size={14} />
              new tenant
            </Link>
          </Button>
        </div>
      </header>

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
            <Button variant="outline" onClick={() => refetch()}>
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

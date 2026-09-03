import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { useApiClient } from "@/app";
import { Button, PageContainer, PageHeader } from "@/components";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";

type ApiClient = ReturnType<typeof useApiClient>;
type Thing = Awaited<ReturnType<ApiClient["template"]["listThings"]>>["data"][number];
type UpvoteCounts = Awaited<ReturnType<ApiClient["votes"]["getUpvoteCounts"]>>;

export const Route = createFileRoute("/_layout/_public/things/")({
  head: () => ({
    meta: [
      { title: "Things | app" },
      {
        name: "description",
        content: "Thing registry — a generic typed table demo of durable, plugin-owned records.",
      },
    ],
  }),
  component: ThingsIndex,
});

function createColumns(
  upvoteCounts: UpvoteCounts | undefined,
  isLoadingUpvotes: boolean,
): DataTableColumnDef<Thing>[] {
  return [
    {
      accessorKey: "thingId",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs truncate max-w-[160px] block text-foreground">
          {row.original.thingId}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.type}</span>
      ),
    },
    {
      id: "upvotes",
      header: "Upvotes",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUp className="h-3.5 w-3.5" />
          {isLoadingUpvotes ? "—" : (upvoteCounts?.[row.original.thingId]?.totalCount ?? 0)}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/things/$thingId" params={{ thingId: row.original.thingId }}>
            View
          </Link>
        </Button>
      ),
    },
  ];
}

function ThingsIndex() {
  const apiClient = useApiClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["things-list"],
    queryFn: () => apiClient.template.listThings({ limit: 50 }),
    staleTime: 30 * 1000,
  });

  const things: Thing[] = data?.data ?? [];
  const thingIds = useMemo(() => things.map((thing) => thing.thingId), [things]);

  const upvoteCountsQuery = useQuery({
    queryKey: ["thing-upvote-counts", thingIds],
    queryFn: () => apiClient.votes.getUpvoteCounts({ entityIds: thingIds }),
    enabled: thingIds.length > 0,
    staleTime: 30 * 1000,
  });

  const columns = useMemo(
    () => createColumns(upvoteCountsQuery.data, upvoteCountsQuery.isLoading),
    [upvoteCountsQuery.data, upvoteCountsQuery.isLoading],
  );

  return (
    <PageContainer variant="default">
      <div className="space-y-4">
        <PageHeader
          title="Things"
          actions={
            <div className="flex items-center gap-2">
              <Link
                to="/things/live"
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Live stream
              </Link>
              <Link
                to="/things/new"
                className="h-9 rounded-[12px] bg-primary px-4 text-sm font-bold text-primary-foreground inline-flex items-center no-underline transition-colors duration-150 hover:opacity-90"
              >
                New thing
              </Link>
            </div>
          }
        />

        <p className="text-sm text-muted-foreground">
          The thing registry is a generic API-owned durable store. Each thing has a plugin-owned
          type and payload, supports real-time SSE events, and is rendered here through the typed{" "}
          <code className="font-mono text-xs">DataTable</code> component.
        </p>

        {isLoading ? (
          <div className="rounded-md border border-border p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-[12px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Couldn't load things: <span className="font-mono">{String(error.message)}</span>
          </div>
        ) : (
          <DataTable columns={columns} data={things} />
        )}
      </div>
    </PageContainer>
  );
}

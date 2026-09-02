import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FileCheck2 } from "lucide-react";
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
import { DataTable } from "@/components/ui/data-table";
import {
  PROPOSAL_REVIEW_FILTERS,
  type ProposalReviewFilter,
  parseProposalReviewFilter,
  proposalReviewStatusVariant,
} from "./-proposal-review";

type ApiClient = ReturnType<typeof useApiClient>;
type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
type Proposal = ProposalResult["data"][number];
type AdminProposalSearch = { status?: ProposalReviewFilter };

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/proposals/")({
  validateSearch: (search: Record<string, unknown>): AdminProposalSearch => ({
    status: parseProposalReviewFilter(search.status),
  }),
  head: () => ({
    meta: [{ title: "Proposal review | app" }],
  }),
  component: AdminProposals,
});

function AdminProposals() {
  const apiClient = useApiClient();
  const navigate = Route.useNavigate();
  const { status } = Route.useSearch();
  const activeFilter = status ?? "pending";
  const queryKey = ["admin-proposals", activeFilter] as const;

  const proposalsQuery = useQuery({
    queryKey,
    queryFn: () =>
      activeFilter === "all"
        ? apiClient.proposals.getProposals({ limit: 100 })
        : apiClient.proposals.getProposals({ reviewStatus: activeFilter, limit: 100 }),
    staleTime: 15 * 1000,
  });

  const columns = useMemo<ColumnDef<Proposal>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="block max-w-36 truncate font-mono text-xs text-muted-foreground">
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "pluginId",
        header: "Plugin",
        cell: ({ row }) => <Badge variant="outline">{row.original.pluginId}</Badge>,
      },
      {
        accessorKey: "entityId",
        header: "Entity",
        cell: ({ row }) => (
          <span className="block max-w-52 truncate font-mono text-xs text-muted-foreground">
            {row.original.entityId}
          </span>
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Created by",
        cell: ({ row }) => (
          <span className="block max-w-44 truncate font-mono text-xs text-muted-foreground">
            {row.original.createdBy}
          </span>
        ),
      },
      {
        accessorKey: "submissionCount",
        header: "Submissions",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.submissionCount}</span>
        ),
      },
      {
        accessorKey: "reviewStatus",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={proposalReviewStatusVariant(row.original.reviewStatus)}>
            {row.original.reviewStatus}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/admin/proposals/$proposalId"
              params={{ proposalId: row.original.id }}
              search={{ pluginId: row.original.pluginId, entityId: row.original.entityId }}
            >
              {row.original.reviewStatus === "pending" ? "review" : "view"}
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const proposals = proposalsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Proposal review"
        action={
          <Badge variant="secondary">
            {proposalsQuery.data?.meta.total ?? 0} {activeFilter === "all" ? "total" : activeFilter}
          </Badge>
        }
      />

      <Tabs
        value={activeFilter}
        onValueChange={(value) =>
          navigate({
            search: { status: value === "pending" ? undefined : (value as ProposalReviewFilter) },
          })
        }
      >
        <TabsList className="justify-start overflow-x-auto">
          {PROPOSAL_REVIEW_FILTERS.map((filter) => (
            <TabsTrigger key={filter} value={filter} className="capitalize">
              {filter}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {proposalsQuery.isLoading ? (
        <Card className="space-y-3 p-6">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </Card>
      ) : proposalsQuery.isError ? (
        <EmptyState
          icon={FileCheck2}
          title="Failed to load proposals"
          description={
            proposalsQuery.error.message || "Something went wrong while loading proposals."
          }
          action={
            <Button variant="outline" onClick={() => proposalsQuery.refetch()}>
              retry
            </Button>
          }
        />
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={activeFilter === "pending" ? "No pending proposals." : "No proposals found."}
          description={`There are no ${activeFilter === "all" ? "" : `${activeFilter} `}proposals to show.`}
          className="min-h-[40vh]"
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={proposals} />
        </div>
      )}
    </div>
  );
}

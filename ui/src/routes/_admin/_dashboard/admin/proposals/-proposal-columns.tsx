import { Link } from "@tanstack/react-router";
import type { useApiClient } from "@/app";
import { Badge, Button } from "@/components";
import type { DataTableColumnDef } from "@/components/data-table";
import { proposalReviewStatusVariant } from "./-proposal-review";

type ApiClient = ReturnType<typeof useApiClient>;
type ProposalResult = Awaited<ReturnType<ApiClient["proposals"]["getProposals"]>>;
export type Proposal = ProposalResult["data"][number];

export function createProposalColumns(): DataTableColumnDef<Proposal>[] {
  return [
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
  ];
}

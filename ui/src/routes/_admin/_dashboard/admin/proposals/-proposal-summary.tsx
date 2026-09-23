import { Badge, Card } from "@/components";
import { MetaRow } from "./-meta-row";
import { NodeProposalDetails } from "./-node-proposal-details";
import type { Proposal } from "./-proposal-columns";
import { proposalReviewStatusVariant } from "./-proposal-review";

export function ProposalSummary({ proposal }: { proposal: Proposal }) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{proposal.id}</p>
          <h2 className="font-mono text-lg font-semibold text-foreground">{proposal.entityId}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={proposalReviewStatusVariant(proposal.reviewStatus)}>
            {proposal.reviewStatus}
          </Badge>
          <Badge variant="outline">apply: {proposal.applyStatus.replace("_", " ")}</Badge>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetaRow label="Plugin" value={proposal.pluginId} mono />
        <MetaRow label="Entity" value={proposal.entityId} mono />
        <MetaRow label="Created by" value={proposal.createdBy} mono />
        <MetaRow label="Submissions" value={String(proposal.submissionCount)} />
        <MetaRow label="Created" value={new Date(proposal.createdAt).toLocaleString()} />
        <MetaRow label="Updated" value={new Date(proposal.updatedAt).toLocaleString()} />
      </div>

      {proposal.rejectionReason && (
        <div className="rounded-[8px] border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg">
          <p className="font-semibold">Rejection reason</p>
          <p className="mt-1">{proposal.rejectionReason}</p>
        </div>
      )}

      {proposal.applyError && (
        <div className="rounded-[8px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          <p className="font-semibold text-destructive">Apply error</p>
          <p className="mt-1">{proposal.applyError}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payload
        </p>
        <pre className="max-h-96 overflow-auto rounded-[8px] border border-border bg-muted/40 p-4 font-mono text-xs text-foreground">
          {JSON.stringify(proposal.payload, null, 2)}
        </pre>
      </div>

      {proposal.pluginId === "node" && <NodeProposalDetails payload={proposal.payload} />}
    </Card>
  );
}

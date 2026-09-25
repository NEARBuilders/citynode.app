import { nodeProposalPayloadSchema } from "@/routes/_authenticated/_dashboard/-node-application";
import { MetaRow } from "./-meta-row";

export function NodeProposalDetails({ payload }: { payload: unknown }) {
  const parsed = nodeProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return (
      <div className="rounded-lg bg-destructive-muted p-4 text-sm text-destructive-muted-foreground">
        This node proposal has an invalid payload and cannot be applied safely.
      </div>
    );
  }

  const proposal = parsed.data;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Node application</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetaRow label="Applicant account" value={proposal.accountId} mono />
        <MetaRow label="Submitting account" value={proposal.submitterAccountId} mono />
        <MetaRow label="Organization" value={proposal.orgId} mono />
        <MetaRow label="Kind" value={proposal.kind} />
        <MetaRow label="Parent" value={proposal.parentId ?? "root"} mono />
        <MetaRow label="Name" value={proposal.name} />
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-sm font-medium text-muted-foreground">Motivation</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{proposal.motivation}</p>
      </div>
    </div>
  );
}

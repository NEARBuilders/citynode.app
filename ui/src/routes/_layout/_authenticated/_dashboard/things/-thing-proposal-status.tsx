import { Clock3 } from "lucide-react";
import type { useApiClient } from "@/app";
import { cn } from "@/lib/utils";

type ApiClient = ReturnType<typeof useApiClient>;
export type ThingProposal = Awaited<
  ReturnType<ApiClient["proposals"]["getProposals"]>
>["data"][number];

type ThingProposalStatusContent = {
  title: string;
  description: string;
  className: string;
};

function getThingProposalStatusContent(proposal: ThingProposal): ThingProposalStatusContent {
  if (proposal.reviewStatus === "pending") {
    return {
      title: "Pending review",
      description: "An admin must approve this proposal before the thing goes live.",
      className: "border-status-warning-border bg-status-warning-bg text-status-warning-foreground",
    };
  }
  if (proposal.reviewStatus === "approved") {
    const description =
      proposal.applyStatus === "applied"
        ? "Approved and live in the thing registry."
        : proposal.applyStatus === "failed"
          ? `Approved, but applying it failed${proposal.applyError ? `: ${proposal.applyError}` : "."}`
          : "Approved and being applied to the thing registry.";
    return {
      title: proposal.applyStatus === "applied" ? "Approved" : "Approved · applying",
      description,
      className: "border-status-success-border bg-status-success-bg text-status-success-foreground",
    };
  }
  if (proposal.reviewStatus === "rejected") {
    return {
      title: "Rejected",
      description: proposal.rejectionReason || "This proposal was not approved.",
      className: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
    };
  }
  return {
    title: "Removed",
    description: "This proposal is no longer active.",
    className: "border-border bg-muted text-muted-foreground",
  };
}

export function ThingProposalStatus({ proposal }: { proposal: ThingProposal }) {
  const content = getThingProposalStatusContent(proposal);

  return (
    <div className={cn("rounded-[12px] border-2 p-4", content.className)}>
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">{content.title}</p>
          <p className="text-sm">{content.description}</p>
        </div>
      </div>
    </div>
  );
}

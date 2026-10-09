import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Badge, InfoRow, LocalDate, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { humanize, RawJson, RawJsonDisclosure } from "../-admin-ui";
import { NodeProposalDetails } from "./-node-proposal-details";
import type { Proposal } from "./-proposal-columns";
import { proposalReviewStatusVariant } from "./-proposal-review";

export function ProposalStatusBadges({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={proposalReviewStatusVariant(proposal.reviewStatus)}
        data-testid="admin-proposal-status"
      >
        {humanize(proposal.reviewStatus, translate)}
      </Badge>
      {proposal.applyStatus !== "not_started" && (
        <Badge variant={proposal.applyStatus === "applied" ? "success" : "outline"}>
          {humanize(proposal.applyStatus, translate)}
        </Badge>
      )}
    </div>
  );
}

export function ProposalSubject({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  const isNode = proposal.pluginId === "node";
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={isNode ? translate("common.application") : translate("common.submission")}
      />
      {isNode ? (
        <>
          <NodeProposalDetails payload={proposal.payload} />
          <RawJsonDisclosure value={proposal.payload} label={translate("common.payload")} />
        </>
      ) : (
        <RawJson value={proposal.payload} />
      )}
    </section>
  );
}

export function ProposalDetails({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("common.details")} />
      <div className="flex flex-col">
        <InfoRow label={translate("admin.proposal.submittedBy")} value={proposal.createdBy} mono />
        <InfoRow
          label={translate("common.submitted")}
          value={<LocalDate value={proposal.createdAt} format="datetime" />}
        />
        <InfoRow
          label={translate("common.updated")}
          value={<LocalDate value={proposal.updatedAt} format="datetime" />}
        />
        <InfoRow label={translate("admin.proposal.submissions")} value={proposal.submissionCount} />
        <InfoRow label={translate("common.plugin")} value={proposal.pluginId} mono />
        <InfoRow label={translate("common.entity")} value={proposal.entityId} mono />
        <InfoRow label={translate("admin.proposal.id")} value={proposal.id} mono />
      </div>
    </section>
  );
}

export function ProposalOutcome({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  const rejected = proposal.reviewStatus === "rejected";
  const Icon = rejected ? XCircleIcon : CheckCircleIcon;
  return (
    <div className="flex flex-col gap-4" data-testid="admin-proposal-outcome">
      <h2 className="text-xl font-semibold text-foreground">
        {translate("admin.proposal.decision")}
      </h2>
      <div className="flex items-center gap-3">
        <Icon
          weight="fill"
          className={rejected ? "size-6 text-destructive" : "size-6 text-success"}
        />
        <span className="text-lg font-medium text-foreground">
          {humanize(proposal.reviewStatus, translate)}
        </span>
      </div>
      {proposal.rejectionReason && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {proposal.rejectionReason}
        </p>
      )}
      {proposal.appliedResourceId && (
        <InfoRow
          label={translate("admin.proposal.resource")}
          value={proposal.appliedResourceId}
          mono
        />
      )}
      {proposal.applyError && (
        <div className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            {translate("proposal.applyFailedDescription")}
          </span>
        </div>
      )}
    </div>
  );
}

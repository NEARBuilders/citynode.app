import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Badge, InfoRow, LocalDate } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import type { Proposal } from "@/lib/queries/proposals";
import { Disclosure, humanize, RawJson, RawJsonDisclosure } from "../-admin-ui";
import { NodeProposalRequest } from "./-node-proposal-details";
import { ProposalStatusCell } from "./-proposal-columns";
import { proposalSetupStatus } from "./-proposal-review";

export function ProposalStatusBadges({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  const showApply =
    proposal.reviewStatus === "approved" &&
    !proposalSetupStatus(proposal, translate) &&
    proposal.applyStatus !== "not_started";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <ProposalStatusCell proposal={proposal} t={translate} />
      {showApply && (
        <Badge
          variant={proposal.applyStatus === "applied" ? "success" : "outline"}
          data-testid="admin-proposal-apply-status"
        >
          {humanize(proposal.applyStatus, translate)}
        </Badge>
      )}
    </span>
  );
}

export function ProposalRequest({ proposal }: { proposal: Proposal }) {
  return proposal.pluginId === "node" ? (
    <NodeProposalRequest proposal={proposal} />
  ) : (
    <RawJson value={proposal.payload} />
  );
}

export function ProposalTechnicalDetails({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  const slug = (proposal.payload as { slug?: unknown } | null)?.slug;
  const orgId = (proposal.payload as { orgId?: unknown } | null)?.orgId;
  return (
    <Disclosure
      label={translate("admin.proposal.showTechnical")}
      openLabel={translate("admin.proposal.hideTechnical")}
      testId="admin-proposal-technical"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          {typeof slug === "string" && (
            <InfoRow label={translate("common.slug")} value={slug} mono />
          )}
          {typeof orgId === "string" && (
            <InfoRow label={translate("common.organization")} value={orgId} mono />
          )}
          <InfoRow
            label={translate("admin.proposal.submittedBy")}
            value={proposal.createdBy}
            mono
          />
          <InfoRow
            label={translate("common.updated")}
            value={<LocalDate value={proposal.updatedAt} format="datetime" />}
          />
          <InfoRow
            label={translate("admin.proposal.submissions")}
            value={proposal.submissionCount}
          />
          <InfoRow label={translate("common.plugin")} value={proposal.pluginId} mono />
          <InfoRow label={translate("common.entity")} value={proposal.entityId} mono />
          <InfoRow label={translate("admin.proposal.id")} value={proposal.id} mono />
        </div>
        <RawJsonDisclosure value={proposal.payload} label={translate("common.payload")} />
      </div>
    </Disclosure>
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
            <span className="mt-1 block">{proposal.applyError}</span>
          </span>
        </div>
      )}
    </div>
  );
}

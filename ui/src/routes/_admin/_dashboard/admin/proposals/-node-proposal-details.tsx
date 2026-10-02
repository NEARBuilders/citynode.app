import { InfoRow } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeProposalPayloadSchema } from "@/routes/_authenticated/_dashboard/-node-application";
import { humanize } from "../-admin-ui";

export function NodeProposalDetails({ payload }: { payload: unknown }) {
  const translate = useAppTranslation();
  const parsed = nodeProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {translate("admin.proposal.invalidPayload")}
      </p>
    );
  }

  const proposal = parsed.data;
  return (
    <div className="flex flex-col gap-6">
      <blockquote className="border-l-2 border-border pl-4 text-base whitespace-pre-wrap text-foreground">
        {proposal.motivation}
      </blockquote>
      <div className="flex flex-col">
        <InfoRow label={translate("common.kind")} value={humanize(proposal.kind, translate)} />
        <InfoRow label={translate("common.slug")} value={proposal.slug} mono />
        <InfoRow
          label={translate("common.parent")}
          value={proposal.parentId ?? "None (country)"}
          mono={!!proposal.parentId}
        />
        <InfoRow label={translate("admin.proposal.owningDao")} value={proposal.accountId} mono />
        <InfoRow
          label={translate("admin.proposal.submittedFrom")}
          value={proposal.submitterAccountId}
          mono
        />
        <InfoRow label={translate("common.organization")} value={proposal.orgId} mono />
      </div>
    </div>
  );
}

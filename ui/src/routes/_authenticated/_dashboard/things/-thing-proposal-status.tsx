import type { useApiClient } from "@/app";
import { Badge } from "@/components";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage, useAppTranslation } from "@/i18n/runtime";

type ApiClient = ReturnType<typeof useApiClient>;
export type ThingProposal = Awaited<
  ReturnType<ApiClient["proposals"]["getProposals"]>
>["data"][number];

type BadgeVariant = "success" | "warning" | "destructive" | "secondary";

export type ThingProposalStatusContent = {
  title: string;
  description: string;
  variant: BadgeVariant;
};

export function getThingProposalStatusContent(
  proposal: ThingProposal,
  t: AppTranslator = translateEnglishAppMessage,
): ThingProposalStatusContent {
  if (proposal.reviewStatus === "pending") {
    return {
      title: t("things.pending"),
      description: t("things.pendingDescription"),
      variant: "warning",
    };
  }
  if (proposal.reviewStatus === "approved") {
    if (proposal.applyStatus === "applied") {
      return {
        title: t("dashboard.approved"),
        description: t("things.approvedDescription"),
        variant: "success",
      };
    }
    if (proposal.applyStatus === "failed") {
      return {
        title: t("things.applyFailed"),
        description: t("things.applyFailedDescription"),
        variant: "destructive",
      };
    }
    return {
      title: t("things.applying"),
      description: t("things.applyingDescription"),
      variant: "success",
    };
  }
  if (proposal.reviewStatus === "rejected") {
    return {
      title: t("dashboard.rejected"),
      description: proposal.rejectionReason || t("things.rejectedDescription"),
      variant: "destructive",
    };
  }
  return {
    title: t("dashboard.removed"),
    description: t("things.inactiveDescription"),
    variant: "secondary",
  };
}

export function ThingProposalStatus({ proposal }: { proposal: ThingProposal }) {
  const translate = useAppTranslation();
  const content = getThingProposalStatusContent(proposal, translate);

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="thing-proposal-status">
      <Badge variant={content.variant}>{content.title}</Badge>
      <span className="text-sm text-muted-foreground">{content.description}</span>
    </div>
  );
}

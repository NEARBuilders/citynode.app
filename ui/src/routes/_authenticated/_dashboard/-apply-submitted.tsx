import { CheckCircleIcon, ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { PageContainer } from "@/components";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import {
  type ApplyStatus,
  applyStatusLabel,
  type ReviewStatus,
  reviewStatusBadge,
} from "./dashboard/node/proposals/-proposal-summary";

export function ApplySubmitted({
  proposalId,
  name,
  reviewStatus,
  applyStatus,
  rejectionReason,
  onRevise,
  onApplyAgain,
}: {
  proposalId: string;
  name?: string;
  reviewStatus: ReviewStatus;
  applyStatus: ApplyStatus;
  rejectionReason: string | null;
  onRevise?: () => void;
  onApplyAgain?: () => void;
}) {
  const t = useAppTranslation();
  const status =
    applyStatus === "failed"
      ? t("label.applyFailed")
      : (applyStatusLabel(applyStatus, t) ?? reviewStatusBadge(reviewStatus, t).label);
  const failed = reviewStatus === "rejected" || applyStatus === "failed";
  const pending = reviewStatus === "pending";
  return (
    <PageContainer variant="narrow">
      <div
        className="flex flex-col items-center gap-6 py-12 text-center"
        data-testid="apply.submitted"
      >
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            failed && "bg-destructive-muted text-destructive-muted-foreground",
            pending && "bg-warning-muted text-warning-muted-foreground",
            !failed && !pending && "bg-success-muted text-success-muted-foreground",
          )}
        >
          {failed ? (
            <WarningCircleIcon className="size-7" weight="fill" />
          ) : pending ? (
            <ClockIcon className="size-7" weight="fill" />
          ) : (
            <CheckCircleIcon className="size-7" weight="fill" />
          )}
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-foreground">{t("apply.status.title")}</h1>
          {reviewStatus === "pending" && (
            <p className="text-base text-muted-foreground">
              {name ? t("apply.submitted.named", { name }) : t("apply.submitted.yours")}
            </p>
          )}
          {reviewStatus !== "pending" && name && (
            <p className="text-base text-muted-foreground">{name}</p>
          )}
          <p className="font-mono text-xs break-all text-muted-foreground">{proposalId}</p>
          <p data-testid="apply.current-status" className="font-semibold text-foreground">
            {status}
          </p>
          {rejectionReason && <p className="text-sm text-muted-foreground">{rejectionReason}</p>}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Button
            nativeButton={false}
            render={<Link to="/apply" reloadDocument />}
            data-testid="apply.view-status"
          >
            {t("apply.status.view")}
          </Button>
          {onRevise && (
            <Button variant="outline" onClick={onRevise} data-testid="apply.revise">
              {t("apply.status.revise")}
            </Button>
          )}
          {onApplyAgain && (
            <Button variant="outline" onClick={onApplyAgain} data-testid="apply.new">
              {t("apply.status.new")}
            </Button>
          )}
          <Button variant="ghost" nativeButton={false} render={<Link to="/dashboard" />}>
            {t("apply.submitted.home")}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

import { CheckCircleIcon, ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { PageContainer } from "@/components";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import { type ProposalPhase, proposalPhaseBadge, proposalPhaseOutcome } from "@/lib/proposal-phase";
import type { ApplicationProgressInput } from "./-application-progress";
import { ApplicationProgressList } from "./-application-progress-list";

export function ApplySubmitted({
  proposalId,
  name,
  phase,
  rejectionReason,
  progress,
  daoAccountId,
  onRevise,
  onApplyAgain,
}: {
  proposalId: string;
  name?: string;
  phase: ProposalPhase;
  rejectionReason: string | null;
  progress?: ApplicationProgressInput;
  daoAccountId?: string | null;
  onRevise?: () => void;
  onApplyAgain?: () => void;
}) {
  const t = useAppTranslation();
  const status = proposalPhaseBadge(phase, t);
  const outcome = proposalPhaseOutcome(phase);
  const failed = outcome === "failed";
  const pending = outcome === "waiting";
  const inReview = phase === "in-review";
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
          {inReview && (
            <p className="text-base text-muted-foreground">
              {name ? t("apply.submitted.named", { name }) : t("apply.submitted.yours")}
            </p>
          )}
          {!inReview && name && <p className="text-base text-muted-foreground">{name}</p>}
          <p className="font-mono text-xs break-all text-muted-foreground">{proposalId}</p>
          <p data-testid="apply.current-status" className="font-semibold text-foreground">
            {status.label}
          </p>
          {rejectionReason && <p className="text-sm text-muted-foreground">{rejectionReason}</p>}
        </div>
        {progress?.reviewStatus === "approved" && (
          <div
            className="w-full max-w-sm rounded-lg border border-border p-5"
            data-testid="apply.progress"
          >
            <ApplicationProgressList proposal={progress} daoAccountId={daoAccountId ?? null} />
          </div>
        )}
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Button
            nativeButton={false}
            render={<Link to="/apply" search={{ application: proposalId }} reloadDocument />}
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

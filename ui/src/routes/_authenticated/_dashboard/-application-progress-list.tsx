import {
  CheckCircleIcon,
  CircleIcon,
  HourglassIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { trezuDaoUrl } from "@/lib/sputnik-proposals";
import {
  type ApplicationProgressInput,
  type ApplicationProgressState,
  type ApplicationProgressStepId,
  communityApplicationProgress,
} from "./-application-progress";

const STEP_LABELS: Record<ApplicationProgressStepId, AppMessageId> = {
  approval: "application.progress.approval",
  organization: "application.progress.organization",
  community: "application.progress.community",
  publication: "application.progress.publication",
  complete: "application.progress.complete",
};

const STATE_LABELS: Record<ApplicationProgressState, AppMessageId> = {
  done: "application.progress.state.done",
  current: "application.progress.state.current",
  waiting: "application.progress.state.waiting",
  failed: "application.progress.state.failed",
  stalled: "application.progress.state.stalled",
  upcoming: "application.progress.state.upcoming",
};

function StepIcon({ state }: { state: ApplicationProgressState }) {
  const className = "mt-0.5 size-5 shrink-0";
  if (state === "done") {
    return <CheckCircleIcon aria-hidden weight="fill" className={cn(className, "text-success")} />;
  }
  if (state === "current") {
    return (
      <SpinnerIcon aria-hidden className={cn(className, "animate-spin text-muted-foreground")} />
    );
  }
  if (state === "waiting") {
    return <HourglassIcon aria-hidden weight="fill" className={cn(className, "text-warning")} />;
  }
  if (state === "failed" || state === "stalled") {
    return (
      <WarningCircleIcon aria-hidden weight="fill" className={cn(className, "text-destructive")} />
    );
  }
  return <CircleIcon aria-hidden className={cn(className, "text-muted-foreground")} />;
}

export function ApplicationProgressList({
  proposal,
  daoAccountId,
  showResources = false,
}: {
  proposal: ApplicationProgressInput;
  daoAccountId: string | null;
  showResources?: boolean;
}) {
  const t = useAppTranslation();
  const steps = communityApplicationProgress(proposal);
  if (!steps) return null;
  return (
    <section className="flex flex-col gap-3 text-left" data-testid="application-progress">
      <h2 className="text-base font-semibold text-foreground">{t("application.progress.title")}</h2>
      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3"
            data-testid={`application-progress-${step.id}`}
            data-state={step.state}
          >
            <StepIcon state={step.state} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm font-medium",
                  step.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {t(STEP_LABELS[step.id])}
              </span>
              <span className="text-xs text-muted-foreground">{t(STATE_LABELS[step.state])}</span>
              {step.state === "waiting" && step.resourceId && daoAccountId && (
                <a
                  className="text-xs text-foreground underline underline-offset-4"
                  href={`${trezuDaoUrl(daoAccountId)}/requests`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="application-progress-dao-vote"
                >
                  {t("application.progress.daoVote", { id: step.resourceId })}
                </a>
              )}
              {showResources &&
                step.state === "done" &&
                step.resourceId &&
                step.id !== "publication" && (
                  <span className="font-mono text-xs wrap-anywhere text-muted-foreground">
                    {step.resourceId}
                  </span>
                )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

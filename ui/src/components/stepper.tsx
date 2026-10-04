import { CheckIcon, CircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";

export type StepState = "pending" | "running" | "success" | "failed";

export interface Step {
  id?: string;
  label: string;
  state: StepState;
  error?: AppMessageId;
  blocking?: boolean;
}

export function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "running":
      return (
        <span className="inline-flex text-muted-foreground shrink-0 mt-px">
          <Spinner className="h-3.5 w-3.5" />
        </span>
      );
    case "success":
      return <CheckIcon className="h-3.5 w-3.5 text-success shrink-0 mt-px" />;
    case "failed":
      return <XCircleIcon className="h-3.5 w-3.5 text-destructive shrink-0 mt-px" />;
    default:
      return <CircleIcon className="h-3.5 w-3.5 text-border shrink-0 mt-px" />;
  }
}

export function StepList({ steps }: { steps: Step[] }) {
  const translate = useAppTranslation();
  return (
    <>
      {steps.map((step, i) => (
        <div key={step.id ?? i} className="flex items-start gap-3">
          <StepIcon state={step.state} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs ${step.state === "failed" ? "text-destructive" : "text-foreground"}`}
              >
                {step.label}
              </span>
              {step.blocking === false && (
                <span className="text-xs text-muted-foreground">
                  {translate("feature.nonBlocking")}
                </span>
              )}
            </div>
            {step.error && (
              <p className="text-xs text-destructive mt-0.5 break-all">{translate(step.error)}</p>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function useStepper(
  stepLabels: readonly { id?: string; label: string; blocking?: boolean }[],
) {
  const [steps, setSteps] = useState<Step[]>(() =>
    stepLabels.map((s) => ({ ...s, state: "pending" })),
  );

  const updateStep = useCallback((index: number, state: StepState, error?: AppMessageId) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state, error } : s)));
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(stepLabels.map((s) => ({ ...s, state: "pending" as StepState })));
  }, [stepLabels]);

  const runStep = useCallback(
    async <T,>(index: number, fn: () => Promise<T>): Promise<T | undefined> => {
      updateStep(index, "running");
      try {
        const value = await fn();
        updateStep(index, "success");
        return value;
      } catch {
        updateStep(index, "failed", "error.action");
        return undefined;
      }
    },
    [updateStep],
  );

  return {
    steps: steps.map((step, index) => ({ ...step, label: stepLabels[index]?.label ?? step.label })),
    updateStep,
    resetSteps,
    runStep,
  };
}

import { useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { PageContainer, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AppActionError, appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { useDaoConnection } from "@/lib/dao-connect";
import { pageTitle } from "@/lib/page-title";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { placeQueryKeys, placeResolutionQueryOptions } from "@/lib/queries/places";
import { invalidateProposalQueries } from "@/lib/queries/proposals";
import { useNearAccount } from "@/lib/use-near-account";
import { ApplyApplicantFields } from "./-apply-applicant-fields";
import { type ApplyStepId, applicationInProgress, resolveApplySteps } from "./-apply-flow";
import { useApplicationForm } from "./-apply-form";
import { ApplyPlaceFields } from "./-apply-place-fields";
import { ApplyDaoStep, ApplyNearStep } from "./-apply-prerequisites";
import { ApplyStep } from "./-apply-step";
import { ApplySubmit } from "./-apply-submit";
import { ApplySubmitted } from "./-apply-submitted";
import {
  type ApplicationPlace,
  canSubmitNodeApplication,
  myNodeApplicationsQueryOptions,
  type NodeApplicationValues,
  proposeNodeApplication,
} from "./-node-application";

export const Route = createFileRoute("/_authenticated/_dashboard/apply")({
  validateSearch: (search: Record<string, unknown>): { application?: string } => ({
    ...(typeof search.application === "string" && search.application
      ? { application: search.application }
      : {}),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "dashboard.startCommunity",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.applyDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const t = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { application: viewedApplicationId } = Route.useSearch();
  const nearAccountId = useNearAccount();
  const daoConnection = useDaoConnection();
  const [placePath, setPlacePath] = useState<ApplicationPlace[]>([]);
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [verifiedDaoAccountId, setVerifiedDaoAccountId] = useState<string | null>(null);
  const [reopenedStep, setReopenedStep] = useState<ApplyStepId | null>(null);
  const handleDaoVerified = useCallback(
    ({ daoAccountId }: { daoAccountId: string }) => setVerifiedDaoAccountId(daoAccountId),
    [],
  );
  const myApplications = useQuery(myNodeApplicationsQueryOptions(apiClient, nearAccountId ?? ""));
  const latestApplication = myApplications.data?.data.reduce<
    (typeof myApplications.data.data)[number] | undefined
  >(
    (latest, proposal) =>
      !latest || Date.parse(proposal.createdAt) > Date.parse(latest.createdAt) ? proposal : latest,
    undefined,
  );
  const shownProposalId = submittedProposalId ?? viewedApplicationId;
  const viewedApplication = shownProposalId
    ? myApplications.data?.data.find((proposal) => proposal.id === shownProposalId)
    : undefined;
  const existingApplication = submittedProposalId
    ? viewedApplication
    : viewedApplication && !revising
      ? viewedApplication
      : latestApplication && applicationInProgress(latestApplication)
        ? latestApplication
        : undefined;
  const existingPayload = existingApplication?.payload as
    | { name?: unknown; accountId?: unknown; motivation?: unknown }
    | undefined;
  const selectedPlace = placePath.at(-1) ?? null;
  const { data: placeResolution, isFetching: placeChecking } = useQuery(
    placeResolutionQueryOptions(apiClient, selectedPlace?.slug ?? ""),
  );

  const submitMutation = useMutation({
    mutationFn: async (values: NodeApplicationValues) => {
      if (!nearAccountId) throw new AppActionError("apply.error.near");
      if (!daoConnection.daoAccountId || verifiedDaoAccountId !== daoConnection.daoAccountId) {
        throw new AppActionError("apply.error.dao");
      }
      if (!selectedPlace) throw new AppActionError("apply.error.place");
      return proposeNodeApplication(
        apiClient,
        values,
        { ...selectedPlace, activated: !!placeResolution?.community },
        {
          daoAccountId: daoConnection.daoAccountId,
          submitterAccountId: nearAccountId,
        },
      );
    },
    onSuccess: async ({ data: proposal }) => {
      setSubmittedProposalId(proposal.id);
      toast.success(t("apply.success.title"), {
        description: t("apply.success.review"),
      });
      try {
        await invalidateProposalQueries(queryClient);
        await invalidateNodeQueries(queryClient);
        await queryClient.invalidateQueries({ queryKey: placeQueryKeys.all });
        await queryClient.invalidateQueries({ queryKey: ["my-node-applications", nearAccountId] });
      } catch {
        toast.warning(t("apply.success.refresh"));
      }
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, t, "apply.error.submit")),
  });
  const form = useApplicationForm((values) => submitMutation.mutateAsync(values));
  const formValues = useSelector(form.store, (state) => state.values);

  useEffect(() => {
    if (verifiedDaoAccountId && verifiedDaoAccountId !== daoConnection.daoAccountId) {
      setVerifiedDaoAccountId(null);
    }
  }, [daoConnection.daoAccountId, verifiedDaoAccountId]);

  const canSubmit =
    canSubmitNodeApplication({
      values: formValues,
      place: selectedPlace,
      daoAccountId:
        verifiedDaoAccountId === daoConnection.daoAccountId ? daoConnection.daoAccountId : null,
      submitterAccountId: nearAccountId,
      submitting: submitMutation.isPending,
    }) && !placeChecking;

  const daoVerified =
    !!daoConnection.daoAccountId && verifiedDaoAccountId === daoConnection.daoAccountId;
  const steps = resolveApplySteps({ near: !!nearAccountId, dao: daoVerified }, reopenedStep);

  const routePending = !!nearAccountId && myApplications.isPending;

  if (nearAccountId && myApplications.isError && !submittedProposalId) {
    return (
      <PageContainer variant="narrow">
        <p role="alert">{t("dashboard.proposalLoadError")}</p>
        <Button variant="outline" onClick={() => void myApplications.refetch()}>
          {t("common.retry")}
        </Button>
      </PageContainer>
    );
  }

  if (routePending && !submittedProposalId) {
    return (
      <PageContainer variant="narrow">
        <div className="flex justify-center py-12" data-testid="apply.loading">
          <Spinner />
        </div>
      </PageContainer>
    );
  }

  if (submittedProposalId || (existingApplication && !revising)) {
    return (
      <ApplySubmitted
        proposalId={existingApplication?.id ?? submittedProposalId ?? ""}
        name={
          typeof existingPayload?.name === "string" ? existingPayload.name : selectedPlace?.name
        }
        reviewStatus={existingApplication?.reviewStatus ?? "pending"}
        applyStatus={existingApplication?.applyStatus ?? "not_started"}
        rejectionReason={existingApplication?.rejectionReason ?? null}
        progress={existingApplication}
        daoAccountId={
          typeof existingPayload?.accountId === "string" ? existingPayload.accountId : null
        }
        onRevise={
          existingApplication?.reviewStatus === "rejected" && !submittedProposalId
            ? () => {
                form.reset(
                  {
                    motivation:
                      typeof existingPayload?.motivation === "string"
                        ? existingPayload.motivation
                        : "",
                  },
                  { keepDefaultValues: true },
                );
                setPlacePath([]);
                setRevising(true);
              }
            : undefined
        }
        onApplyAgain={!submittedProposalId ? () => setRevising(true) : undefined}
      />
    );
  }

  return (
    <PageContainer variant="narrow">
      <PageHeader
        headerTestId="apply.heading"
        title={t("apply.title")}
        description={t("apply.progress", { step: steps.position })}
      />
      <ol className="flex flex-col" data-testid="apply.steps">
        <ApplyStep
          id="near"
          number={1}
          title={t("apply.step.near")}
          status={steps.status("near")}
          summary={nearAccountId}
        >
          <ApplyNearStep />
        </ApplyStep>
        <ApplyStep
          id="dao"
          number={2}
          title={t("apply.step.dao")}
          status={steps.status("dao")}
          summary={daoConnection.daoAccountId}
          onChange={() => setReopenedStep("dao")}
        >
          <ApplyDaoStep
            verified={daoVerified}
            onDaoVerified={handleDaoVerified}
            onContinue={() => setReopenedStep(null)}
          />
        </ApplyStep>
        <ApplyStep
          id="details"
          number={3}
          title={t("apply.step.details")}
          status={steps.status("details")}
          last
        >
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <ApplyPlaceFields path={placePath} onPathChange={setPlacePath} />
              <ApplyApplicantFields form={form} />
            </FieldGroup>
            <ApplySubmit canSubmit={canSubmit} isSubmitting={submitMutation.isPending} />
          </form>
        </ApplyStep>
      </ol>
    </PageContainer>
  );
}

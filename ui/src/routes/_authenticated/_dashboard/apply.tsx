import { useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getGatewayId, useApiClient } from "@/app";
import { PageContainer, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { AppActionError, appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { useDaoConnection } from "@/lib/dao-connect";
import { pageTitle } from "@/lib/page-title";
import { childNodesQueryOptions, rootNodesQueryOptions } from "@/lib/queries/nodes";
import { invalidateProposalQueries } from "@/lib/queries/proposals";
import { bindingPreflightQueryOptions } from "@/lib/queries/tenants";
import { useNearAccount } from "@/lib/use-near-account";
import { ApplyApplicantFields } from "./-apply-applicant-fields";
import { type ApplyStepId, applicationInProgress, resolveApplySteps } from "./-apply-flow";
import { useApplicationForm } from "./-apply-form";
import { loadNodeApplicationParents } from "./-apply-loader";
import { ApplyNodeFields } from "./-apply-node-fields";
import { ApplyDaoStep, ApplyNearStep } from "./-apply-prerequisites";
import { ApplyStep } from "./-apply-step";
import { ApplySubmit } from "./-apply-submit";
import { ApplySubmitted } from "./-apply-submitted";
import {
  canSubmitNodeApplication,
  myNodeApplicationsQueryOptions,
  type NodeApplicationValues,
  proposeNodeApplication,
} from "./-node-application";

export const Route = createFileRoute("/_authenticated/_dashboard/apply")({
  loader: ({ context }) =>
    loadNodeApplicationParents({
      apiClient: context.apiClient,
      queryClient: context.queryClient,
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
  const initialRootNodes = Route.useLoaderData();
  const { runtimeConfig } = Route.useRouteContext();
  const gatewayId = getGatewayId(runtimeConfig);
  const nearAccountId = useNearAccount();
  const daoConnection = useDaoConnection();
  const slugManuallyEdited = useRef(false);
  const [rootParentId, setRootParentId] = useState(initialRootNodes[0]?.id ?? "");
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [verifiedDaoAccountId, setVerifiedDaoAccountId] = useState<string | null>(null);
  const [reopenedStep, setReopenedStep] = useState<ApplyStepId | null>(null);
  const handleDaoVerified = useCallback(
    ({ daoAccountId }: { daoAccountId: string }) => setVerifiedDaoAccountId(daoAccountId),
    [],
  );
  const myApplications = useQuery(myNodeApplicationsQueryOptions(apiClient, nearAccountId ?? ""));
  const latestApplication = myApplications.data?.data[0];
  const existingApplication = submittedProposalId
    ? myApplications.data?.data.find((proposal) => proposal.id === submittedProposalId)
    : latestApplication && applicationInProgress(latestApplication)
      ? latestApplication
      : undefined;
  const existingPayload = existingApplication?.payload as
    | { orgId?: unknown; name?: unknown; slug?: unknown; accountId?: unknown }
    | undefined;
  const retainedOrgId = (slug: string) =>
    existingApplication?.reviewStatus === "rejected" &&
    existingPayload?.slug === slug &&
    typeof existingPayload.orgId === "string"
      ? existingPayload.orgId
      : null;

  const submitMutation = useMutation({
    mutationFn: async (values: NodeApplicationValues) => {
      if (!gatewayId) {
        throw new AppActionError("apply.error.gateway");
      }
      if (!nearAccountId) throw new AppActionError("apply.error.near");
      if (!daoConnection.daoAccountId || verifiedDaoAccountId !== daoConnection.daoAccountId) {
        throw new AppActionError("apply.error.dao");
      }
      const orgId = retainedOrgId(values.slug);
      return proposeNodeApplication(apiClient, values, {
        ...(orgId ? { orgId } : {}),
        daoAccountId: daoConnection.daoAccountId,
        submitterAccountId: nearAccountId,
      });
    },
    onSuccess: async ({ data: proposal }) => {
      setSubmittedProposalId(proposal.id);
      toast.success(t("apply.success.title"), {
        description: t("apply.success.review"),
      });
      try {
        await invalidateProposalQueries(queryClient);
        await queryClient.invalidateQueries({ queryKey: ["my-node-applications", nearAccountId] });
      } catch {
        toast.warning(t("apply.success.refresh"));
      }
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, t, "apply.error.submit")),
  });
  const form = useApplicationForm((values) => submitMutation.mutateAsync(values));
  const formValues = useSelector(form.store, (state) => state.values);
  const hostname = formValues.slug && gatewayId ? `${formValues.slug}.${gatewayId}` : "";
  const legacyOrgId = retainedOrgId(formValues.slug);

  const { data: queriedRootNodes } = useQuery(rootNodesQueryOptions(apiClient));
  const rootNodes = queriedRootNodes ?? initialRootNodes;
  useEffect(() => {
    if (verifiedDaoAccountId && verifiedDaoAccountId !== daoConnection.daoAccountId) {
      setVerifiedDaoAccountId(null);
    }
  }, [daoConnection.daoAccountId, verifiedDaoAccountId]);

  const { data: stateNodes = [], isLoading: statesLoading } = useQuery({
    ...childNodesQueryOptions(apiClient, rootParentId),
    enabled: formValues.kind === "city" && !!rootParentId,
  });
  const { data: preflight, isFetching: preflightLoading } = useQuery({
    ...bindingPreflightQueryOptions(apiClient, hostname),
    enabled: !!hostname,
  });
  const { data: organizationSlug, isFetching: organizationSlugLoading } = useQuery({
    queryKey: ["apply-organization-slug", formValues.slug],
    queryFn: () => apiClient.auth.checkSlug({ slug: formValues.slug }),
    enabled: !!formValues.slug && !legacyOrgId,
  });
  const organizationSlugAvailable = !!legacyOrgId || organizationSlug?.status === true;

  const canSubmit = canSubmitNodeApplication({
    values: formValues,
    daoAccountId:
      verifiedDaoAccountId === daoConnection.daoAccountId ? daoConnection.daoAccountId : null,
    submitterAccountId: nearAccountId,
    hostnameAvailable: preflight?.hostname.available === true,
    organizationSlugAvailable,
    preflightLoading: preflightLoading || organizationSlugLoading,
    submitting: submitMutation.isPending,
  });

  const daoVerified =
    !!daoConnection.daoAccountId && verifiedDaoAccountId === daoConnection.daoAccountId;
  const steps = resolveApplySteps({ near: !!nearAccountId, dao: daoVerified }, reopenedStep);

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

  if (submittedProposalId || (existingApplication && !revising)) {
    return (
      <ApplySubmitted
        proposalId={existingApplication?.id ?? submittedProposalId ?? ""}
        name={
          typeof existingPayload?.name === "string" ? existingPayload.name : formValues.name.trim()
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
                const prior = existingApplication.payload as Partial<NodeApplicationValues>;
                form.reset({
                  kind: prior.kind ?? "country",
                  parentId: prior.parentId ?? null,
                  name: prior.name ?? "",
                  slug: prior.slug ?? "",
                  motivation: prior.motivation ?? "",
                });
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
              <ApplyNodeFields
                form={form}
                formValues={formValues}
                gatewayId={gatewayId}
                hostname={hostname}
                preflight={preflight}
                preflightLoading={preflightLoading || organizationSlugLoading}
                organizationSlugAvailable={legacyOrgId ? true : organizationSlug?.status}
                rootNodes={rootNodes}
                rootParentId={rootParentId}
                setRootParentId={setRootParentId}
                slugManuallyEdited={slugManuallyEdited}
                stateNodes={stateNodes}
                statesLoading={statesLoading}
              />
              <ApplyApplicantFields form={form} />
            </FieldGroup>
            <ApplySubmit canSubmit={canSubmit} isSubmitting={submitMutation.isPending} />
          </form>
        </ApplyStep>
      </ol>
    </PageContainer>
  );
}

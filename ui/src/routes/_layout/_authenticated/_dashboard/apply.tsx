import { useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getActiveRuntime, type Organization, useApiClient, useAuthClient } from "@/app";
import { PageContainer, PageHeader } from "@/components";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";
import { useDaoConnection } from "@/lib/dao-connect";
import { childNodesQueryOptions, rootNodesQueryOptions } from "@/lib/queries/nodes";
import { invalidateProposalQueries } from "@/lib/queries/proposals";
import { bindingPreflightQueryOptions } from "@/lib/queries/tenants";
import { useNearAccount } from "@/lib/use-near-account";
import { ApplyApplicantFields } from "./-apply-applicant-fields";
import { useApplicationForm } from "./-apply-form";
import { loadNodeApplicationParents } from "./-apply-loader";
import { ApplyNodeFields } from "./-apply-node-fields";
import { ApplyPrerequisites } from "./-apply-prerequisites";
import { ApplySubmit } from "./-apply-submit";
import { ApplySubmitted } from "./-apply-submitted";
import {
  canSubmitNodeApplication,
  getDefaultOrganizationId,
  type NodeApplicationValues,
  proposeNodeApplication,
  resolveActiveOrganizationLabel,
} from "./-node-application";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/apply")({
  loader: ({ context }) =>
    loadNodeApplicationParents({
      apiClient: context.apiClient,
      queryClient: context.queryClient,
    }),
  head: () => ({
    meta: [{ title: "Apply | app" }, { name: "description", content: "Apply to run a City Node." }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const apiClient = useApiClient();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const initialRootNodes = Route.useLoaderData();
  const { auth, runtimeConfig } = Route.useRouteContext();
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const activeOrgId = auth.activeOrganizationId;
  const nearAccountId = useNearAccount();
  const daoConnection = useDaoConnection();
  const attemptedDefaultOrgId = useRef<string | null>(null);
  const slugManuallyEdited = useRef(false);
  const [rootParentId, setRootParentId] = useState(initialRootNodes[0]?.id ?? "");
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);
  const [verifiedDaoAccountId, setVerifiedDaoAccountId] = useState<string | null>(null);
  const handleDaoVerified = useCallback(
    ({ daoAccountId }: { daoAccountId: string }) => setVerifiedDaoAccountId(daoAccountId),
    [],
  );

  const submitMutation = useMutation({
    mutationFn: async (values: NodeApplicationValues) => {
      if (!activeOrgId) throw new Error("Select an active organization first");
      if (!nearAccountId) throw new Error("Connect a NEAR account first");
      if (!daoConnection.daoAccountId || verifiedDaoAccountId !== daoConnection.daoAccountId) {
        throw new Error("Connect and verify the tenant DAO first");
      }
      return proposeNodeApplication(apiClient, values, {
        orgId: activeOrgId,
        daoAccountId: daoConnection.daoAccountId,
        submitterAccountId: nearAccountId,
      });
    },
    onSuccess: async ({ data: proposal }) => {
      setSubmittedProposalId(proposal.id);
      toast.success("Node application submitted", {
        description: "A platform administrator can now review it.",
      });
      try {
        await invalidateProposalQueries(queryClient);
      } catch {
        toast.warning("Application submitted, but the review list could not refresh.");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Failed to submit application"),
  });
  const form = useApplicationForm((values) => submitMutation.mutateAsync(values));
  const formValues = useSelector(form.store, (state) => state.values);
  const hostname = formValues.slug ? `${formValues.slug}.${gatewayId}` : "";

  const { data: queriedRootNodes } = useQuery(rootNodesQueryOptions(apiClient));
  const rootNodes = queriedRootNodes ?? initialRootNodes;
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data } = await authClient.organization.list();
      return (data ?? []) as Organization[];
    },
    staleTime: 30 * 1000,
  });
  const defaultOrgId = getDefaultOrganizationId(activeOrgId, organizations);
  const switchOrganization = useSwitchOrganization();
  const displayedOrgId =
    activeOrgId ?? (switchOrganization.isError ? null : (defaultOrgId ?? null));
  const activeOrganizationLabel = resolveActiveOrganizationLabel(displayedOrgId, organizations);

  useEffect(() => {
    if (!defaultOrgId || attemptedDefaultOrgId.current === defaultOrgId) return;
    attemptedDefaultOrgId.current = defaultOrgId;
    switchOrganization.mutate(defaultOrgId);
  }, [defaultOrgId, switchOrganization.mutate]);
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

  const canSubmit = canSubmitNodeApplication({
    values: formValues,
    orgId: activeOrgId,
    daoAccountId:
      verifiedDaoAccountId === daoConnection.daoAccountId ? daoConnection.daoAccountId : null,
    submitterAccountId: nearAccountId,
    hostnameAvailable: preflight?.hostname.available === true,
    preflightLoading,
    submitting: submitMutation.isPending,
  });

  if (submittedProposalId) return <ApplySubmitted proposalId={submittedProposalId} />;

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          title="Apply to run a City Node"
          description="Propose a country, state, or city node for platform administrator review."
        />
        <ApplyPrerequisites
          displayedOrgId={displayedOrgId}
          nearAccountId={nearAccountId}
          onDaoVerified={handleDaoVerified}
        />
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <ApplyNodeFields
            form={form}
            formValues={formValues}
            gatewayId={gatewayId}
            hostname={hostname}
            preflight={preflight}
            preflightLoading={preflightLoading}
            rootNodes={rootNodes}
            rootParentId={rootParentId}
            setRootParentId={setRootParentId}
            slugManuallyEdited={slugManuallyEdited}
            stateNodes={stateNodes}
            statesLoading={statesLoading}
          />
          <ApplyApplicantFields
            activeOrganizationLabel={activeOrganizationLabel}
            activatingOrganization={!activeOrgId && !!defaultOrgId}
            daoAccountId={daoConnection.daoAccountId}
            form={form}
            nearAccountId={nearAccountId}
          />
          <ApplySubmit
            canSubmit={canSubmit}
            hostname={hostname}
            hostnameAvailable={preflight?.hostname.available}
            isSubmitting={submitMutation.isPending}
          />
        </form>
      </div>
    </PageContainer>
  );
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  type Passkey,
  type SessionData,
  sessionQueryOptions,
  useApiClient,
  useAuthClient,
} from "@/app";
import { Bulletin, PageContainer, PageHeader, SectionHeader, Skeleton } from "@/components";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { selectCommunityNode } from "@/lib/community-node";
import { type FeatureArea, isFeatureArea } from "@/lib/feature-areas";
import { pageTitle } from "@/lib/page-title";
import { tenantNodesQueryOptions } from "@/lib/queries/nodes";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { canManageCommunity, canOrganizeEvents } from "@/lib/team-workspace";
import { useNearAccount } from "@/lib/use-near-account";
import { IdentityCard } from "./-identity-card";
import { type HomeInvitation, InvitationSteps } from "./-invitation-steps";
import { getNextSteps, getNodeSetupSteps } from "./-next-steps";
import { NextStepsList } from "./-next-steps-list";
import { NodeSetupChecklist } from "./-node-setup-checklist";
import { RestrictedAreaNotice } from "./-restricted-area-notice";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { restricted?: FeatureArea | "admin" | "owners" } =>
    search.restricted === "admin" || search.restricted === "owners"
      ? { restricted: search.restricted }
      : typeof search.restricted === "string" && isFeatureArea(search.restricted)
        ? { restricted: search.restricted }
        : {},
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.home",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.homeDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: Home,
});

function Home() {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const { restricted } = Route.useSearch();
  const { data: session } = useQuery<SessionData | null>(sessionQueryOptions(auth));
  const nearAccountId = useNearAccount();
  const activeOrgId = session?.session?.activeOrganizationId ?? "";

  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data } = await auth.passkey.listUserPasskeys();
      return (data || []) as Passkey[];
    },
    staleTime: 60 * 1000,
  });
  const organizations = useQuery(organizationsQueryOptions(apiClient));
  const invitations = useQuery({
    queryKey: ["user-invitations"],
    queryFn: async (): Promise<HomeInvitation[]> => {
      try {
        return await apiClient.auth.listUserInvitations();
      } catch {
        return [];
      }
    },
    staleTime: 30 * 1000,
  });
  const tenant = useQuery(tenantByOrgQueryOptions(apiClient, activeOrgId));
  const nodes = useQuery({
    ...tenantNodesQueryOptions(apiClient, tenant.data?.id ?? ""),
    enabled: !!tenant.data?.id,
  });
  const authContext = useQuery({
    queryKey: ["home-auth-context", activeOrgId],
    queryFn: () => apiClient.auth.getContext().catch(() => null),
    enabled: !!activeOrgId,
    staleTime: 30 * 1000,
  });

  const user = session?.user;
  const canManage = user?.role === "admin" || canManageCommunity(authContext.data);
  const node = selectCommunityNode(nodes.data ?? []);
  const nodeId = node?.id ?? "";
  const profile = useQuery({
    ...discoveryProfileQueryOptions(apiClient, nodeId),
    enabled: canManage && !!nodeId,
  });
  const activities = useQuery({
    queryKey: ["discovery-activities", nodeId],
    queryFn: () => apiClient.listDiscoveryActivities({ nodeId }),
    enabled: canManage && !!nodeId,
    retry: false,
  });
  const onboardingCodes = useQuery({
    queryKey: ["home-onboarding-codes", activeOrgId],
    queryFn: () => apiClient.auth.listOnboardingCodes({ organizationId: activeOrgId }),
    enabled: canManage && !!nodeId && !!activeOrgId,
    retry: false,
  });

  const bulletin = node?.metadata?.bulletin;

  const pending = (invitations.data ?? []).filter((invitation) => invitation.status === "pending");
  const orgs = organizations.data ?? [];
  const activeOrg = orgs.find((org) => org.id === activeOrgId) ?? null;
  const isAdmin = user?.role === "admin";
  const community = tenant.data ? { name: tenant.data.name, tenantId: tenant.data.id } : null;
  const loading =
    !user || organizations.isPending || (!!activeOrgId && tenant.isPending) || passkeys.isPending;

  const steps = getNextSteps(
    {
      isAnonymous: user?.isAnonymous ?? false,
      hasPasskey: (passkeys.data?.length ?? 0) > 0,
      hasNear: !!nearAccountId,
      organizationCount: orgs.length,
      activeOrganizationName: activeOrg?.name ?? null,
      community,
      canManageCommunity: canManage,
      canOrganizeEvents: canOrganizeEvents(authContext.data),
      isAdmin,
    },
    translate,
  );

  const setupSteps =
    canManage && community && node && profile.isSuccess && activities.isSuccess
      ? getNodeSetupSteps({
          profile: profile.data,
          eventCount: activities.data.length,
          onboardingCodeCount: onboardingCodes.data?.length ?? 0,
        })
      : null;
  const showSetup = !!setupSteps && setupSteps.some((step) => !step.done);

  const firstName = user?.isAnonymous ? null : user?.name?.split(" ")[0];

  return (
    <PageContainer>
      {restricted && <RestrictedAreaNotice area={restricted} />}
      <PageHeader
        headerTestId="home.heading"
        title={
          firstName
            ? translate("dashboard.welcomeNamed", { name: firstName ?? "" })
            : translate("common.home")
        }
        description={translate("dashboard.description")}
      />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
          {typeof bulletin === "string" && bulletin.trim() && <Bulletin content={bulletin} />}
          {pending.length > 0 && (
            <section className="flex flex-col gap-6">
              <SectionHeader title={translate("org.invitations")} />
              <InvitationSteps invitations={pending} />
            </section>
          )}
          {showSetup && setupSteps && community && node && (
            <NodeSetupChecklist
              steps={setupSteps}
              communityName={community.name}
              nodeId={node.id}
              tenantId={community.tenantId}
            />
          )}
          <section className="flex flex-col gap-6">
            <SectionHeader title={translate("dashboard.nextSteps")} />
            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : (
              <NextStepsList steps={steps} primary={pending.length === 0 && !showSetup} />
            )}
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          {user ? (
            <IdentityCard
              user={user}
              nearAccountId={nearAccountId}
              passkeyCount={passkeys.data?.length ?? 0}
            />
          ) : (
            <Skeleton className="h-56 w-full rounded-2xl" />
          )}
        </aside>
      </div>
    </PageContainer>
  );
}

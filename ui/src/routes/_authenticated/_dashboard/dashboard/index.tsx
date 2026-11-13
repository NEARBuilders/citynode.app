import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  type Passkey,
  type SessionData,
  sessionQueryOptions,
  useApiClient,
  useAuthClient,
} from "@/app";
import { Bulletin, Button, PageContainer, PageHeader, SectionHeader, Skeleton } from "@/components";
import { AttendanceRecord } from "@/components/attendance-record";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { useIsClient } from "@/hooks";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { selectCommunityNode } from "@/lib/community-node";
import { type FeatureArea, isFeatureArea } from "@/lib/feature-areas";
import { pageTitle } from "@/lib/page-title";
import { communityOrganizationId, resolveCommunityMembership } from "@/lib/personal-organization";
import { tenantNodesQueryOptions } from "@/lib/queries/nodes";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import {
  canManageCommunity,
  canOrganizeEvents,
  isInFinanceTeam,
  resolveTeamWorkspace,
} from "@/lib/team-workspace";
import { useNearAccount } from "@/lib/use-near-account";
import { LoadError } from "@/routes/_admin/_dashboard/admin/-admin-ui";
import { IdentityCard } from "./-identity-card";
import { type HomeInvitation, InvitationSteps } from "./-invitation-steps";
import { getNextSteps } from "./-next-steps";
import { NextStepsList } from "./-next-steps-list";
import { useNodeSetupSteps } from "./-node-setup-checklist";
import { OwnerOverview, OwnerSetupLine } from "./-owner-overview";
import { PlatformOverview } from "./-platform-overview";
import { RestrictedAreaNotice } from "./-restricted-area-notice";
import { communityAuthContextQueryOptions } from "./node/-community-header";

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
  const linkedNearAccount = useNearAccount();
  const nearAccountId = useIsClient() ? linkedNearAccount : null;
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
  const user = session?.user;
  const membership = resolveCommunityMembership({
    organizations: organizations.data,
    activeOrganizationId: activeOrgId,
    userId: user?.id,
    refreshing: organizations.isFetching,
    isAdmin: user?.role === "admin",
  });
  const communityOrgId =
    membership.status === "unknown" ? activeOrgId : (communityOrganizationId(membership) ?? "");
  const tenant = useQuery(tenantByOrgQueryOptions(apiClient, communityOrgId));
  const nodes = useQuery({
    ...tenantNodesQueryOptions(apiClient, tenant.data?.id ?? ""),
    enabled: !!tenant.data?.id,
  });
  const authContext = useQuery({
    ...communityAuthContextQueryOptions(apiClient, activeOrgId),
    enabled: !!activeOrgId,
  });

  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || canManageCommunity(authContext.data);
  const node = selectCommunityNode(nodes.data ?? []);
  const nodeId = node?.id ?? "";
  const community = tenant.data ? { name: tenant.data.name, tenantId: tenant.data.id } : null;
  const ownerCommunity =
    !isAdmin &&
    node &&
    community &&
    communityOrgId === activeOrgId &&
    canOrganizeEvents(authContext.data, { includePlatformAdmin: false })
      ? {
          nodeId: node.id,
          nodeIds: (nodes.data ?? []).map((item) => item.id),
          organizationId: activeOrgId,
          name: community.name,
        }
      : null;
  const setupSteps = useNodeSetupSteps({
    nodeId,
    organizationId: activeOrgId,
    enabled: !!ownerCommunity && canManage,
  });

  const bulletin = node?.metadata?.bulletin;

  const pending = (invitations.data ?? []).filter((invitation) => invitation.status === "pending");
  const loading =
    !user ||
    organizations.isPending ||
    (!!communityOrgId && tenant.isPending) ||
    passkeys.isPending;

  const steps = getNextSteps(
    {
      isAnonymous: user?.isAnonymous ?? false,
      hasPasskey: (passkeys.data?.length ?? 0) > 0,
      hasNear: !!nearAccountId,
      membership: membership.status === "unknown" && community ? "active" : membership.status,
      communityCount: membership.status === "choose" ? membership.count : 0,
      community,
      canManageCommunity: canManage,
      canOrganizeEvents: canOrganizeEvents(authContext.data),
      inFinanceTeam: isInFinanceTeam(
        authContext.data,
        resolveTeamWorkspace(authContext.data).allowedAreas,
      ),
      isAdmin,
    },
    translate,
  );

  const [firstStep, ...laterSteps] = steps;
  const safetyFirst =
    !!ownerCommunity && !loading && pending.length === 0 && firstStep?.id === "save-account";
  const listedSteps = safetyFirst ? laterSteps : steps;
  const setupLeft = !!ownerCommunity && !!setupSteps && setupSteps.some((step) => !step.done);
  const bulletinCard = typeof bulletin === "string" && bulletin.trim() && (
    <Bulletin content={bulletin} />
  );

  const firstName = user?.isAnonymous ? null : user?.name?.split(" ")[0];

  return (
    <PageContainer variant={isAdmin || ownerCommunity ? "wide" : "default"}>
      {restricted && <RestrictedAreaNotice area={restricted} />}
      <PageHeader
        headerTestId="home.heading"
        title={
          firstName
            ? translate("dashboard.welcomeNamed", { name: firstName ?? "" })
            : translate("common.home")
        }
        description={
          isAdmin
            ? translate("admin.home.description")
            : ownerCommunity
              ? translate("dashboard.ownerDescription", { name: ownerCommunity.name })
              : translate("dashboard.description")
        }
      />
      {safetyFirst && firstStep && (
        <NextStepsList steps={[firstStep]} primary testId="home-owner.account-safety" />
      )}
      {authContext.isError && !authContext.data && (
        <LoadError
          message={translate("org.roleLoadFailed")}
          onRetry={() => void authContext.refetch()}
          testId="home.auth-context-error"
        />
      )}
      {isAdmin && <PlatformOverview />}
      {ownerCommunity && <OwnerOverview community={ownerCommunity} invitations={pending} />}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
          {!ownerCommunity && bulletinCard}
          {!ownerCommunity && pending.length > 0 && (
            <section className="flex flex-col gap-6">
              <SectionHeader title={translate("org.invitations")} />
              <InvitationSteps invitations={pending} />
            </section>
          )}
          {setupLeft && setupSteps && ownerCommunity && (
            <OwnerSetupLine steps={setupSteps} communityName={ownerCommunity.name} />
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
              <>
                {organizations.isError && !organizations.data && (
                  <Item variant="outline" data-testid="home-organizations-error">
                    <ItemContent className="min-w-0">
                      <ItemTitle>{translate("org.loadFailed")}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void organizations.refetch()}
                        data-testid="home-organizations-retry"
                      >
                        {translate("common.retry")}
                      </Button>
                    </ItemActions>
                  </Item>
                )}
                <NextStepsList
                  steps={listedSteps}
                  primary={!ownerCommunity && pending.length === 0}
                />
              </>
            )}
          </section>
          {ownerCommunity && bulletinCard}
          <AttendanceRecord testId="home.attendance" />
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

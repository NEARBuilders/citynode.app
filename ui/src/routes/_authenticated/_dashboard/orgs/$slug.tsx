import { BankIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Navigate,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { type SessionData, sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import {
  Button,
  EmptyState,
  PageContainer,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";
import { useTeamWorkspace } from "@/components/layout/use-team-workspace";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { isPersonalOrganization } from "@/lib/personal-organization";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { isCommunitySettingsRole } from "@/lib/team-workspace";
import { PUBLISHED_CONFIG_SECTION_ID } from "../tenant/-published-config-section";
import { useOpenCommunitySettings } from "../tenant/-use-open-community-settings";
import {
  ApiKeysTab,
  type CreatedOrganizationApiKey,
  type OrganizationApiKey,
} from "./-api-keys-tab";
import { InvitationsTab } from "./-invitations-tab";
import {
  isLegacySettingsTab,
  LEGACY_SETTINGS_TABS,
  legacySettingsTarget,
} from "./-legacy-settings-tab";
import { MembersTab } from "./-members-tab";
import { OnboardingTab } from "./-onboarding-tab";
import { useOrganizationApiKeyActions } from "./-organization-api-keys";
import { OrganizationEditForm } from "./-organization-edit-form";
import { useOrganizationInvitationActions } from "./-organization-invitations";
import {
  orgActiveRoleQueryOptions,
  orgMembersQueryOptions,
  useOrganizationMemberActions,
} from "./-organization-members";
import { OrganizationOverview } from "./-organization-overview";
import { orgApiKeysQueryKey, orgInvitationsQueryKey } from "./-organization-query-keys";
import { useOrganizationSettings } from "./-organization-settings";
import {
  isOrganizationTab,
  ORGANIZATION_TABS,
  resolveOrganizationTab,
  visibleOrganizationTabs,
} from "./-organization-tabs";
import { useOrganizationTeams } from "./-organization-teams";
import { TeamsTab } from "./-teams-tab";

type ApiClientType = import("@/app").ApiClient;
type InvitationItem = Awaited<ReturnType<ApiClientType["auth"]["listInvitations"]>>[number];

const organizationSearchSchema = z.object({
  tab: z
    .enum([...ORGANIZATION_TABS, ...LEGACY_SETTINGS_TABS])
    .default("members")
    .catch("members"),
});

async function handleCopyApiKey(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error(translateAppMessage("keys.copyFailed"));
  }
}

export const Route = createFileRoute("/_authenticated/_dashboard/orgs/$slug")({
  validateSearch: organizationSearchSchema,
  search: { middlewares: [stripSearchParams({ tab: "members" })] },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.organization",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.organizationDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions(context.authClient));
    await context.queryClient.ensureQueryData(organizationsQueryOptions(context.apiClient));
  },
  component: OrganizationDetail,
});

function OrganizationDetail() {
  const translate = useAppTranslation();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { slug: orgSlug } = Route.useParams();
  const { tab: requestedTab } = Route.useSearch();
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const { data: session } = useQuery<SessionData | null>(sessionQueryOptions(auth));
  const { data: organizations = [], isLoading: isLoadingOrgs } = useQuery(
    organizationsQueryOptions(apiClient),
  );
  const org = organizations.find((organization) => organization.slug === orgSlug);
  const orgId = org?.id ?? "";
  const activeOrgId = session?.session?.activeOrganizationId;
  const isActive = orgId === activeOrgId;
  const membersQuery = useQuery({
    ...orgMembersQueryOptions(apiClient, orgId),
    enabled: !!orgId && org?.status === "active",
  });
  const members = membersQuery.data ?? [];
  const roleQuery = useQuery({
    ...orgActiveRoleQueryOptions(apiClient, orgId),
    enabled: !!orgId && org?.status === "active",
  });
  const myRole = roleQuery.data;
  const canManageMembers = isCommunitySettingsRole(myRole);
  const invitations =
    useQuery({
      queryKey: orgInvitationsQueryKey(orgId),
      queryFn: async (): Promise<InvitationItem[]> => {
        return apiClient.auth.listInvitations({ organizationId: orgId });
      },
      enabled: !!orgId && org?.status === "active" && canManageMembers,
    }).data ?? [];
  const apiKeys =
    useQuery({
      queryKey: orgApiKeysQueryKey(orgId),
      queryFn: async (): Promise<OrganizationApiKey[]> => {
        const { data, error } = await auth.apiKey.list({
          query: { configId: "org-keys", organizationId: orgId },
        });
        if (error) throw new Error(error.message);
        return (data?.apiKeys ?? []) as OrganizationApiKey[];
      },
      enabled: !!orgId && org?.status === "active" && canManageMembers,
    }).data ?? [];
  const canViewSettings = canManageMembers || session?.user?.role === "admin";
  const isOwner = myRole === "owner";
  const tenantQuery = useQuery({
    ...tenantByOrgQueryOptions(apiClient, orgId),
    enabled: !!orgId && org?.status === "active" && canViewSettings,
  });
  const settingsTenantId = canViewSettings ? tenantQuery.data?.id : undefined;
  const workspace = useTeamWorkspace(isActive).data;
  const canOrganize =
    canManageMembers ||
    (isActive && (workspace?.teams ?? []).some((team) => team.areas.includes("events")));
  const pendingInvitationsCount = invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;
  const [createdApiKey, setCreatedApiKey] = useState<CreatedOrganizationApiKey | null>(null);
  const switchOrg = useSwitchOrganization();
  const communitySettings = useOpenCommunitySettings();
  const openSettings =
    settingsTenantId && communitySettings.needsSwitch(orgId)
      ? () => void communitySettings.open({ orgId, tenantId: settingsTenantId })
      : undefined;

  const [pendingTeamDeleteId, setPendingTeamDeleteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const isPersonal = org ? isPersonalOrganization(org, session?.user?.id) : false;
  const { cancelInvitationMutation, inviteMutation, resendInvitationMutation } =
    useOrganizationInvitationActions(apiClient, orgId);
  const { createApiKeyMutation, deleteApiKeyMutation } = useOrganizationApiKeyActions(
    auth,
    orgId,
    (apiKey) => setCreatedApiKey(apiKey),
  );
  const { removeMemberMutation } = useOrganizationMemberActions(auth, orgId);
  const exportEmailsMutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.auth.exportMembers({ organizationId: orgId });
      return result.csv;
    },
    onSuccess: async (csv) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${org?.slug ?? "organization"}-members.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(translate("org.emailsExported"));
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const visibleTabs = visibleOrganizationTabs({ canManageMembers, canOrganize });
  const activeTab = resolveOrganizationTab(requestedTab, visibleTabs);
  const setActiveTab = (value: unknown) => {
    if (!isOrganizationTab(value) || !visibleTabs.includes(value) || value === activeTab) return;
    void navigate({ search: (prev) => ({ ...prev, tab: value }), replace: true });
  };
  const teamsState = useOrganizationTeams(
    orgId,
    activeTab === "teams" && org?.status === "active",
    canManageMembers && org?.status === "active",
  );
  const { deleteOrgMutation, leaveOrgMutation, updateOrgMutation } = useOrganizationSettings(
    auth,
    orgId,
    router,
    () => setIsEditing(false),
  );

  if (isLoadingOrgs) {
    return (
      <PageContainer variant="wide">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }
  if (!org) {
    return (
      <PageContainer variant="wide">
        <EmptyState
          icon={BankIcon}
          title={translate("org.notFound")}
          description={translate("org.notFoundDescription")}
          action={
            <Button variant="outline" nativeButton={false} render={<Link to="/orgs" />}>
              {translate("org.back")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (org?.status !== "active") {
    return (
      <PageContainer variant="narrow">
        <PageHeader
          title={org.name}
          subtitle={`@${org.slug}`}
          headerTestId="orgs.request.heading"
        />
        <div className="flex flex-col gap-4" data-testid="orgs-request-status">
          <h2 className="text-lg font-medium">
            {org?.status === "pending"
              ? translate("orgApproval.pending")
              : translate("orgApproval.rejected")}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="orgs-request-reason">
            {org?.status === "pending" ? translate("orgApproval.pendingHint") : org.rejectionReason}
          </p>
          <Button variant="outline" nativeButton={false} render={<Link to="/orgs" />}>
            {translate("org.back")}
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (isLegacySettingsTab(requestedTab)) {
    if (!roleQuery.isFetched || (canViewSettings && !tenantQuery.isFetched)) {
      return (
        <PageContainer variant="wide">
          <Skeleton className="h-64 w-full" />
        </PageContainer>
      );
    }
    const target = legacySettingsTarget({ canViewSettings, tenantId: tenantQuery.data?.id });
    return target.to === "settings" ? (
      <LegacySettingsRedirect
        orgId={orgId}
        tenantId={target.tenantId}
        onFailed={() =>
          void navigate({ search: (prev) => ({ ...prev, tab: "members" }), replace: true })
        }
      />
    ) : (
      <Navigate to="/orgs/$slug" params={{ slug: orgSlug }} search={{ tab: "members" }} replace />
    );
  }

  return (
    <PageContainer variant="wide">
      <OrganizationOverview
        canDelete={isOwner}
        isDeleting={deleteOrgMutation.isPending}
        isActive={isActive}
        isPersonal={isPersonal}
        isLeaving={leaveOrgMutation.isPending}
        isSwitching={switchOrg.isPending || communitySettings.isPending}
        memberCount={members.length}
        myRole={myRole}
        onDelete={() => deleteOrgMutation.mutate()}
        onEdit={() => {
          setEditName(org.name);
          setEditSlug(org.slug);
          setIsEditing(true);
        }}
        onLeave={() => leaveOrgMutation.mutate()}
        onOpenSettings={openSettings}
        onSwitch={() => switchOrg.mutate(orgId)}
        org={org}
        settingsTenantId={settingsTenantId}
        startCommunitySlug={
          org.status === "active" && isOwner && !isPersonal && !settingsTenantId
            ? org.slug
            : undefined
        }
      />
      {isOwner && (
        <OrganizationEditForm
          open={isEditing}
          editName={editName}
          editSlug={editSlug}
          isPending={updateOrgMutation.isPending}
          onCancel={() => setIsEditing(false)}
          onNameChange={setEditName}
          onSave={() => updateOrgMutation.mutate({ name: editName, slug: editSlug })}
          onSlugChange={setEditSlug}
        />
      )}
      {roleQuery.data === undefined && roleQuery.isError ? (
        <div
          role="alert"
          data-testid="orgs-role-error"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          {translate("org.roleLoadFailed")}
          <Button
            variant="outline"
            onClick={() => void roleQuery.refetch()}
            disabled={roleQuery.isFetching}
            data-testid="orgs-role-retry"
          >
            {translate("org.retry")}
          </Button>
        </div>
      ) : roleQuery.data === undefined ? (
        <Skeleton className="h-64 w-full" data-testid="orgs-tabs-loading" />
      ) : activeTab ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList variant="line">
              {canManageMembers && (
                <>
                  <TabsTrigger value="members" data-testid="orgs-tab-members">
                    {translate("org.members")}
                    <TabCount value={members.length} />
                  </TabsTrigger>
                  <TabsTrigger value="teams" data-testid="orgs-tab-teams">
                    {translate("org.teams")}
                    <TabCount value={teamsState.teams.length} />
                  </TabsTrigger>
                  <TabsTrigger value="invitations" data-testid="orgs-tab-invitations">
                    {translate("org.invitations")}
                    <TabCount value={pendingInvitationsCount} />
                  </TabsTrigger>
                </>
              )}
              {canOrganize && (
                <TabsTrigger value="onboard" data-testid="orgs-tab-onboard">
                  {translate("org.onboarding")}
                </TabsTrigger>
              )}
              {canManageMembers && (
                <TabsTrigger value="apikeys" data-testid="orgs-tab-apikeys">
                  {translate("org.apiKeys")}
                  <TabCount value={apiKeys.length} />
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          {canManageMembers && (
            <>
              <MembersTab
                canManageMembers={canManageMembers}
                canExportEmails={canManageMembers}
                isExportingEmails={exportEmailsMutation.isPending}
                isRemoving={removeMemberMutation.isPending}
                members={members}
                onExportEmails={() => exportEmailsMutation.mutate()}
                onInvite={isPersonal ? undefined : () => setActiveTab("invitations")}
                onRemove={(member) => removeMemberMutation.mutate(member)}
                sessionUserId={session?.user?.id}
              />
              <TeamsTab
                canManage={canManageMembers}
                isMutating={teamsState.isMutating}
                onAddMember={(teamId, userId) =>
                  teamsState.addTeamMember.mutate({ teamId, userId })
                }
                onAreasChange={(teamId, areas) => teamsState.updateTeam.mutate({ teamId, areas })}
                onCreate={(name) => teamsState.createTeam.mutate(name)}
                onDelete={(teamId) => setPendingTeamDeleteId(teamId)}
                onRemoveMember={(teamId, userId) =>
                  teamsState.removeTeamMember.mutate({ teamId, userId })
                }
                onRetryMembers={teamsState.retryTeamMembers}
                onRename={(teamId, name) => teamsState.updateTeam.mutate({ teamId, name })}
                orgMembers={members}
                teams={teamsState.teams}
              />
              <ConfirmDialog
                open={pendingTeamDeleteId !== null}
                onOpenChange={(open) => {
                  if (!open) setPendingTeamDeleteId(null);
                }}
                title={translate("common.deleteQuestion", {
                  name:
                    teamsState.teams.find((team) => team.id === pendingTeamDeleteId)?.name ??
                    translate("org.teamFallback"),
                })}
                description={translate("org.deleteTeamDescription")}
                confirmLabel={translate("org.deleteTeamAction")}
                variant="destructive"
                isPending={teamsState.deleteTeam.isPending}
                onConfirm={() => {
                  if (!pendingTeamDeleteId) return;
                  teamsState.deleteTeam.mutate(pendingTeamDeleteId, {
                    onSettled: () => setPendingTeamDeleteId(null),
                  });
                }}
              />
              <InvitationsTab
                canManageMembers={canManageMembers}
                invitePending={inviteMutation.isPending}
                invitations={invitations}
                isPersonal={isPersonal}
                isCancelling={cancelInvitationMutation.isPending}
                isResending={resendInvitationMutation.isPending}
                onCancel={(invitationId) => cancelInvitationMutation.mutate(invitationId)}
                onInvite={(values) => inviteMutation.mutateAsync(values)}
                onResend={(invitation) => resendInvitationMutation.mutate(invitation)}
                teams={teamsState.teams}
              />
            </>
          )}
          {canOrganize && <OnboardingTab apiClient={apiClient} orgId={orgId} isActive={isActive} />}
          {canManageMembers && (
            <ApiKeysTab
              apiKeys={apiKeys}
              canManageMembers={canManageMembers}
              createdApiKey={createdApiKey}
              isCreating={createApiKeyMutation.isPending}
              isDeleting={deleteApiKeyMutation.isPending}
              onCopy={handleCopyApiKey}
              onCreate={(values) => createApiKeyMutation.mutate(values)}
              onDelete={(keyId) => deleteApiKeyMutation.mutate(keyId)}
              onDismiss={() => setCreatedApiKey(null)}
            />
          )}
        </Tabs>
      ) : null}
    </PageContainer>
  );
}

/**
 * Sends a retired settings tab to Community settings, making the organization
 * active first when it isn't (see useOpenCommunitySettings).
 */
function LegacySettingsRedirect({
  orgId,
  tenantId,
  onFailed,
}: {
  orgId: string;
  tenantId: string;
  onFailed: () => void;
}) {
  const { open } = useOpenCommunitySettings();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open({ orgId, tenantId, hash: PUBLISHED_CONFIG_SECTION_ID, replace: true }).then(
      (opened) => {
        if (!opened) onFailed();
      },
    );
  }, [open, orgId, tenantId, onFailed]);
  return (
    <PageContainer variant="wide">
      <Skeleton className="h-64 w-full" />
    </PageContainer>
  );
}

function TabCount({ value }: { value: number }) {
  if (value === 0) return null;
  return <span className="text-muted-foreground tabular-nums">{value}</span>;
}

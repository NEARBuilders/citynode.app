import { BankIcon, EnvelopeSimpleIcon, PlusIcon, WalletIcon } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { toast } from "sonner";
import {
  type Organization,
  type SessionData,
  sessionQueryOptions,
  useApiClient,
  useAuthClient,
} from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  LocalDate,
  PageContainer,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { tenantOrganizationIdsQueryOptions } from "@/lib/queries/tenants";
import { OrgAvatar, roleLabel } from "./-org-avatar";
import { orgMembersQueryKey } from "./-organization-query-keys";
import { useInvitationActions } from "./-use-invitation-actions";

type ApiClientType = import("@/app").ApiClient;
type AuthClientType = import("@/app").AuthClient;
type UserInvitationItem = Awaited<ReturnType<ApiClientType["auth"]["listUserInvitations"]>>[number];
type MembersResponse = Awaited<ReturnType<AuthClientType["organization"]["listMembers"]>>;
type MemberItem = NonNullable<MembersResponse["data"]>["members"][number];

export const Route = createFileRoute("/_authenticated/_dashboard/orgs/")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.organizations",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.organizationsDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions(context.authClient));
    await context.queryClient.ensureQueryData({
      queryKey: ["organizations"],
      queryFn: async () => {
        const { data } = await context.authClient.organization.list();
        return (data || []) as Organization[];
      },
      staleTime: 30 * 1000,
    });
    await context.queryClient.ensureQueryData({
      queryKey: ["user-invitations"],
      queryFn: async (): Promise<UserInvitationItem[]> => {
        try {
          return await context.apiClient.auth.listUserInvitations();
        } catch {
          return [];
        }
      },
      staleTime: 30 * 1000,
    });
  },
  component: OrganizationsList,
});

function OrganizationsList() {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const router = useRouter();
  const { data: session } = useQuery<SessionData | null>(sessionQueryOptions(auth));
  const { data: organizations, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data } = await auth.organization.list();
      return (data || []) as Organization[];
    },
    staleTime: 30 * 1000,
  });

  const { data: userInvitations = [] } = useQuery({
    queryKey: ["user-invitations"],
    queryFn: async (): Promise<UserInvitationItem[]> => {
      try {
        return await apiClient.auth.listUserInvitations();
      } catch {
        return [];
      }
    },
    staleTime: 30 * 1000,
  });

  const orgs = organizations || [];

  const { data: tenantOrgIds = new Set<string>() } = useQuery({
    ...tenantOrganizationIdsQueryOptions(
      apiClient,
      orgs.map((organization) => organization.id),
    ),
    enabled: orgs.length > 0,
  });

  const memberQueries = useQueries({
    queries: orgs.map((organization) => ({
      queryKey: orgMembersQueryKey(organization.id),
      queryFn: async (): Promise<MemberItem[]> => {
        const { data, error } = await auth.organization.listMembers({
          query: { organizationId: organization.id },
        });
        if (error) throw new Error(error.message);
        return (data?.members ?? []) as MemberItem[];
      },
      staleTime: 30 * 1000,
    })),
  });

  const pendingInvitations = userInvitations.filter((i) => i.status === "pending");

  const { acceptMutation, rejectMutation } = useInvitationActions({
    apiClient,
    auth,
    onAccepted: async (invitation) => {
      toast.success(
        translate("org.joinedNamed", { name: invitation.organizationName ?? "organization" }),
      );
      if (invitation.organizationSlug) {
        await router.navigate({
          to: "/orgs/$slug",
          params: { slug: invitation.organizationSlug },
        });
      }
    },
    onRejected: () => {
      toast.success(translate("org.inviteDeclined"));
    },
  });

  const user = session?.user;
  const activeOrgId = session?.session?.activeOrganizationId;
  const switchOrgMutation = useSwitchOrganization();
  const invitationBusy = acceptMutation.isPending || rejectMutation.isPending;
  const hasInvitations = pendingInvitations.length > 0;

  return (
    <PageContainer variant="wide">
      <PageHeader
        title={translate("common.organizations")}
        description={translate("org.listDescription")}
        headerTestId="orgs.heading"
        actions={
          orgs.length > 0 ? (
            <Button
              variant={hasInvitations ? "outline" : "default"}
              nativeButton={false}
              render={<Link to="/orgs/new" />}
              data-testid="orgs-new-button"
            >
              <PlusIcon />
              {translate("org.new")}
            </Button>
          ) : null
        }
      />

      {hasInvitations && (
        <section className="flex flex-col gap-4" data-testid="orgs-invitations">
          <SectionHeader
            title={translate("org.invitationsCount", { count: pendingInvitations.length ?? "" })}
          />
          <div className="flex flex-col gap-2">
            {pendingInvitations.map((invitation) => {
              const orgName = invitation.organizationName ?? invitation.organizationSlug ?? "";
              return (
                <Item key={invitation.id} variant="outline">
                  <ItemMedia>
                    <OrgAvatar name={orgName || "?"} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">
                      <span className="min-w-0 truncate">{orgName}</span>
                    </ItemTitle>
                    <ItemDescription className="wrap-anywhere">
                      {roleLabel(invitation.role, translate)} ·{" "}
                      {invitation.nearAccountId ? (
                        <WalletIcon className="inline size-3.5" />
                      ) : (
                        <EnvelopeSimpleIcon className="inline size-3.5" />
                      )}{" "}
                      {invitation.nearAccountId ?? invitation.email} ·{" "}
                      <Trans
                        id="date.expires"
                        components={{
                          date: <LocalDate value={invitation.expiresAt} format="relative" />,
                        }}
                      />
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => rejectMutation.mutate(invitation)}
                      disabled={invitationBusy}
                    >
                      {rejectMutation.isPending && rejectMutation.variables?.id === invitation.id
                        ? translate("org.declining")
                        : translate("org.decline")}
                    </Button>
                    <Button
                      className="flex-1 sm:flex-none"
                      onClick={() => acceptMutation.mutate(invitation)}
                      disabled={invitationBusy}
                    >
                      {acceptMutation.isPending && acceptMutation.variables?.id === invitation.id
                        ? translate("org.joining")
                        : translate("org.accept")}
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 w-full" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={BankIcon}
          title={translate("org.empty")}
          description={translate("org.createHint")}
          action={
            <Button nativeButton={false} render={<Link to="/orgs/new" />}>
              <PlusIcon />
              {translate("org.create")}
            </Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-4">
          {hasInvitations && <SectionHeader title={translate("org.yourOrganizations")} />}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orgs.map((org, index) => {
              const members = memberQueries[index]?.data;
              const myRole = members?.find((member) => member.userId === user?.id)?.role;
              const isActive = org.id === activeOrgId;
              const isPersonal = user
                ? org.slug === user.id || org.metadata?.isPersonal === true
                : false;
              return (
                <Card key={org.id} data-testid={`orgs-card-${org.slug}`}>
                  <CardContent className="flex h-full flex-col gap-5 p-5">
                    <Link
                      to="/orgs/$slug"
                      params={{ slug: org.slug }}
                      className="flex min-w-0 items-start gap-3 outline-none focus-visible:underline"
                    >
                      <OrgAvatar name={org.name} logo={org.logo} size="lg" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-lg font-medium text-foreground">
                          {org.name}
                        </span>
                        <span className="truncate font-mono text-sm text-muted-foreground">
                          @{org.slug}
                        </span>
                      </div>
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {myRole && <Badge variant="secondary">{roleLabel(myRole, translate)}</Badge>}
                      {isActive && <Badge variant="success">{translate("common.active")}</Badge>}
                      {isPersonal && <Badge variant="outline">{translate("org.personal")}</Badge>}
                      {tenantOrgIds.has(org.id) && (
                        <Badge variant="outline">{translate("common.community")}</Badge>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        {members ? translate("org.memberCount", { count: members.length }) : " "}
                      </span>
                      {isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          nativeButton={false}
                          render={<Link to="/orgs/$slug" params={{ slug: org.slug }} />}
                        >
                          {translate("common.open")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => switchOrgMutation.mutate(org.id)}
                          disabled={switchOrgMutation.isPending}
                        >
                          {translate("org.makeActive")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </PageContainer>
  );
}

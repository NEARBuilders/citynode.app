import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";
import { useAppTranslation } from "@/i18n/runtime";
import { type CommunityPageActions, communityPageActions } from "@/lib/community-page-actions";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { teamJoinBoardQueryOptions } from "@/lib/queries/team-join-requests";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { orgActiveRoleQueryOptions } from "../../_authenticated/orgs/-organization-members";

const HIDDEN: CommunityPageActions = {
  joinHint: false,
  openCommunity: false,
  openEvents: false,
  openSetup: false,
  openAdmin: false,
};

export interface CommunityPageView extends CommunityPageActions {
  organizationId: string | null;
}

export function useCommunityPageActions(tenantId: string | null): CommunityPageView {
  const auth = useAuthClient();
  const api = useApiClient();
  const sessionQuery = useQuery(sessionQueryOptions(auth));
  const user = sessionQuery.data?.user;
  const signedIn = !!user && !user.isAnonymous;
  const platformAdmin = user?.role === "admin";
  const organizations = useQuery({
    ...organizationsQueryOptions(api, user?.id),
    enabled: signedIn,
  });
  const orgs = organizations.data ?? [];
  const tenants = useQueries({
    queries: orgs.map((org) => ({
      ...tenantByOrgQueryOptions(api, org.id),
      enabled: signedIn && org.status === "active" && !!tenantId,
    })),
  });
  const owningOrg = signedIn
    ? orgs.find((org, index) => {
        const tenant = tenants[index]?.data;
        return org.status === "active" && tenant?.id === tenantId;
      })
    : undefined;
  const inCommunity = !!owningOrg;
  const roleQuery = useQuery({
    ...orgActiveRoleQueryOptions(api, owningOrg?.id ?? ""),
    enabled: signedIn && inCommunity,
  });
  const teamsQuery = useQuery({
    ...teamJoinBoardQueryOptions(api, owningOrg?.id ?? ""),
    enabled: signedIn && inCommunity,
  });
  const teamAreas =
    teamsQuery.data?.teams.filter((team) => team.isMember).flatMap((team) => team.areas) ?? [];
  const tenantsLoading = tenants.some((query) => query.isLoading);
  const rolePending =
    sessionQuery.isPending ||
    (signedIn && organizations.isPending) ||
    (signedIn && !!tenantId && tenantsLoading) ||
    (inCommunity && roleQuery.isPending) ||
    (inCommunity && teamsQuery.isPending);

  if (rolePending) return { ...HIDDEN, organizationId: null };
  return {
    ...communityPageActions({
      signedIn,
      platformAdmin,
      inCommunity,
      orgRole: roleQuery.data,
      teamAreas,
      rolePending: false,
    }),
    organizationId: owningOrg?.id ?? null,
  };
}

export function CommunityPageButtons({
  nodeId,
  nodeName,
  actions,
}: {
  nodeId: string;
  nodeName: string;
  actions: CommunityPageView;
}) {
  const translate = useAppTranslation();
  return (
    <>
      {actions.openCommunity && (
        <CommunityDestination
          organizationId={actions.organizationId}
          nodeId={nodeId}
          destination="community"
          testId="node-page.open-community"
          label={translate("community.openMine")}
        />
      )}
      {actions.openEvents && (
        <CommunityDestination
          organizationId={actions.organizationId}
          nodeId={nodeId}
          destination="events"
          testId="node-page.open-events"
          label={translate("community.openEvents")}
        />
      )}
      {actions.openSetup && (
        <CommunityDestination
          organizationId={actions.organizationId}
          nodeId={nodeId}
          destination="community"
          testId="node-page.open-setup"
          label={translate("community.openSetup", { name: nodeName })}
          primary
        />
      )}
      {actions.openAdmin && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/admin/nodes" data-testid="node-page.open-admin" />}
        >
          {translate("community.openAdmin")}
        </Button>
      )}
    </>
  );
}

function CommunityDestination({
  organizationId,
  nodeId,
  destination,
  testId,
  label,
  primary = false,
}: {
  organizationId: string | null;
  nodeId: string;
  destination: "community" | "events";
  testId: string;
  label: string;
  primary?: boolean;
}) {
  const auth = useAuthClient();
  const session = useQuery(sessionQueryOptions(auth));
  const switchOrg = useSwitchOrganization();
  const navigate = useNavigate();
  const activeOrganizationId = session.data?.session?.activeOrganizationId ?? null;
  const needsSwitch = !!organizationId && activeOrganizationId !== organizationId;
  const variant = primary ? "default" : "outline";

  const open = () => {
    if (!organizationId) return;
    void switchOrg.mutateAsync(organizationId).then(
      () => {
        if (destination === "events") {
          void navigate({
            to: "/nodes/$nodeId/content",
            params: { nodeId },
            search: { tab: "events" },
          });
          return;
        }
        void navigate({ to: "/dashboard/node", search: { nodeId } });
      },
      () => undefined,
    );
  };

  if (needsSwitch) {
    return (
      <Button variant={variant} disabled={switchOrg.isPending} data-testid={testId} onClick={open}>
        {label}
      </Button>
    );
  }

  if (destination === "events") {
    return (
      <Button
        variant={variant}
        nativeButton={false}
        render={
          <Link
            to="/nodes/$nodeId/content"
            params={{ nodeId }}
            search={{ tab: "events" }}
            data-testid={testId}
          />
        }
      >
        {label}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      nativeButton={false}
      render={<Link to="/dashboard/node" search={{ nodeId }} data-testid={testId} />}
    >
      {label}
    </Button>
  );
}

import { HouseIcon } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { isCommunitySettingsRole } from "@/lib/team-workspace";
import { useOrgMemberRole } from "../../_authenticated/_dashboard/orgs/-organization-members";
import { PUBLISHED_CONFIG_SECTION_ID } from "../../_authenticated/_dashboard/tenant/-published-config-section";
import { useOpenCommunitySettings } from "../../_authenticated/_dashboard/tenant/-use-open-community-settings";

export function ProposeHomepageCta({ tenantId }: { tenantId: string | null }) {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const apiClient = useApiClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const signedIn = !!session?.user && !session.user.isAnonymous;
  const enabled = signedIn && !!tenantId;

  const { data: organizations = [] } = useQuery({
    ...organizationsQueryOptions(apiClient),
    enabled,
  });

  const tenants = useQueries({
    queries: organizations.map((org) => ({
      ...tenantByOrgQueryOptions(apiClient, org.id),
      enabled: enabled && org.status === "active",
    })),
  });

  const owningOrg = enabled
    ? organizations.find((org, index) => {
        const tenant = tenants[index]?.data;
        return org.status === "active" && tenant?.id === tenantId && tenant.ownerKind === "dao";
      })
    : undefined;

  const role = useOrgMemberRole(owningOrg?.id, session?.user?.id);
  const canManage = session?.user?.role === "admin" || isCommunitySettingsRole(role);
  const settings = useOpenCommunitySettings();

  if (!owningOrg || !tenantId || !canManage) return null;

  const label = (
    <>
      <HouseIcon />
      {translate("homepage.change")}
    </>
  );

  if (settings.needsSwitch(owningOrg.id)) {
    return (
      <Button
        variant="outline"
        disabled={settings.isPending}
        onClick={() =>
          void settings.open({ orgId: owningOrg.id, tenantId, hash: PUBLISHED_CONFIG_SECTION_ID })
        }
        data-testid="node-page.propose-homepage"
      >
        {label}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={
        <Link
          to="/tenant/$tenantId"
          params={{ tenantId }}
          hash={PUBLISHED_CONFIG_SECTION_ID}
          data-testid="node-page.propose-homepage"
        />
      }
    >
      {label}
    </Button>
  );
}

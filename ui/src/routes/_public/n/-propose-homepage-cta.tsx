import { HouseIcon } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";

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

  if (!enabled) return null;

  const owningOrg = organizations.find((org, index) => {
    const tenant = tenants[index]?.data;
    return org.status === "active" && tenant?.id === tenantId && tenant.ownerKind === "dao";
  });

  if (!owningOrg) return null;

  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={
        <Link
          to="/orgs/$slug"
          params={{ slug: owningOrg.slug }}
          search={{ tab: "homepage" }}
          data-testid="node-page.propose-homepage"
        />
      }
    >
      <HouseIcon />
      {translate("homepage.change")}
    </Button>
  );
}

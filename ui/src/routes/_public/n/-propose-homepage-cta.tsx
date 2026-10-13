import { HouseIcon } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { orgMembersQueryKey } from "../../_authenticated/_dashboard/orgs/-organization-query-keys";
import { PUBLISHED_CONFIG_SECTION_ID } from "../../_authenticated/_dashboard/tenant/-published-config-section";

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

  const { data: members = [] } = useQuery({
    queryKey: orgMembersQueryKey(owningOrg?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await auth.organization.listMembers({
        query: { organizationId: owningOrg?.id ?? "" },
      });
      if (error) throw new Error(error.message);
      return (data?.members ?? []) as Array<{ userId: string; role: string }>;
    },
    enabled: !!owningOrg,
  });
  const role = members.find((member) => member.userId === session?.user?.id)?.role;
  const canManage = session?.user?.role === "admin" || role === "owner" || role === "admin";

  if (!owningOrg || !tenantId || !canManage) return null;

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
      <HouseIcon />
      {translate("homepage.change")}
    </Button>
  );
}

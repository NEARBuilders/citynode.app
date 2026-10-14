import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "@/app";
import { useSwitchOrganization } from "@/components/layout/use-switch-organization";

/**
 * Community settings only resolve the tenants of the session's active
 * organization (platform admins see every tenant), so opening another
 * organization's settings has to make that organization active first —
 * otherwise `/tenant/$tenantId` bounces the owner back to the dashboard.
 */
export function useOpenCommunitySettings() {
  const auth = useAuthClient();
  const navigate = useNavigate();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const switchOrg = useSwitchOrganization();

  const needsSwitch = (orgId: string) =>
    session?.user?.role !== "admin" && session?.session?.activeOrganizationId !== orgId;

  /** Resolves false when the switch failed; the switch hook already reported the error. */
  const open = async ({
    orgId,
    tenantId,
    hash,
    replace,
  }: {
    orgId: string;
    tenantId: string;
    hash?: string;
    replace?: boolean;
  }) => {
    if (needsSwitch(orgId)) {
      try {
        await switchOrg.mutateAsync(orgId);
      } catch {
        return false;
      }
    }
    await navigate({ to: "/tenant/$tenantId", params: { tenantId }, hash, replace });
    return true;
  };

  return { needsSwitch, open, isPending: switchOrg.isPending };
}

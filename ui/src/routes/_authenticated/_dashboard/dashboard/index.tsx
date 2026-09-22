import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  getAccount,
  type Passkey,
  type SessionData,
  sessionQueryOptions,
  useAuthClient,
} from "@/app";
import { useNearAccount } from "@/lib/use-near-account";
import { TenantSummary } from "./-tenant-summary";
import { WorkspaceIdentity } from "./-workspace-identity";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/")({
  beforeLoad: async ({ context }) => {
    const { apiClient, runtimeConfig } = context;
    const accountId = getAccount(runtimeConfig);
    let tenant: Awaited<ReturnType<typeof apiClient.resolveTenant>> | null = null;
    try {
      tenant = await apiClient.resolveTenant({ accountId });
    } catch {
      tenant = null;
    }
    return { tenant };
  },
  head: () => ({
    meta: [{ title: "Workspace | app" }, { name: "description", content: "Your workspace." }],
  }),
  component: Home,
});

function Home() {
  const auth = useAuthClient();
  const { tenant } = Route.useRouteContext();
  const { data: session } = useQuery<SessionData | null>(sessionQueryOptions(auth, undefined));
  const { data: passkeys = [] } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data } = await auth.passkey.listUserPasskeys();
      return (data || []) as Passkey[];
    },
    staleTime: 60 * 1000,
  });
  const user = session?.user;
  const nearAccountId = useNearAccount();

  const profile = {
    isAnonymous: user?.isAnonymous || false,
    hasEmail: Boolean(user?.email),
    hasNear: Boolean(nearAccountId),
    hasPasskeys: passkeys.length > 0,
    isAdmin: user?.role === "admin",
  };
  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const isTenantMember = !!tenant && !!activeOrgId && activeOrgId === tenant.orgId;

  return (
    <div className="space-y-8">
      <WorkspaceIdentity
        nearAccountId={nearAccountId}
        passkeys={passkeys}
        profile={profile}
        tenantMember={isTenantMember}
        user={user}
      />
      {tenant && <TenantSummary tenant={tenant} />}
    </div>
  );
}

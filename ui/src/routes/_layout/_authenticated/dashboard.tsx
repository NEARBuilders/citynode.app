import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Home as HomeIcon, Settings } from "lucide-react";
import { useMemo } from "react";
import {
  getAccount,
  type Passkey,
  type SessionData,
  sessionQueryOptions,
  useAuthClient,
} from "@/app";
import { Button, Card, Chip, PageContainer, PageHeader } from "@/components";
import { InfoRow } from "@/components/ui/info-row";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
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
  const nearAccountId = auth.near.getAccountId();

  const profile = useMemo(() => {
    if (!user)
      return {
        isAnonymous: false,
        hasEmail: false,
        hasNear: false,
        hasPasskeys: false,
        isAdmin: false,
      };
    return {
      isAnonymous: user.isAnonymous || false,
      hasEmail: Boolean(user.email),
      hasNear: Boolean(nearAccountId),
      hasPasskeys: passkeys.length > 0,
      isAdmin: user.role === "admin",
    };
  }, [user, nearAccountId, passkeys.length]);

  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const isTenantMember = !!tenant && !!activeOrgId && activeOrgId === tenant.orgId;

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          icon={HomeIcon}
          label="Workspace"
          title={user?.name || user?.email || "You"}
          actions={
            <Button asChild variant="outline">
              <Link to="/settings" preload="intent">
                <Settings />
                settings
              </Link>
            </Button>
          }
        />

        {!user ? (
          <div className="text-muted-foreground text-center py-12 text-sm">Loading…</div>
        ) : (
          <>
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>workspace</Chip>
                {profile.isAnonymous && <Chip>anonymous</Chip>}
                {profile.isAdmin && <Chip accent>admin</Chip>}
                {isTenantMember && <Chip accent>tenant member</Chip>}
              </div>
              <h2 className="text-foreground text-xl font-semibold">
                {user.name || user.email || user.id.slice(0, 8)}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Manage your identity and connected accounts.
              </p>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                Identity Status
              </div>
              <div className="flex flex-col gap-2">
                <InfoRow
                  label="email"
                  value={profile.hasEmail ? (user.email ?? "linked") : "not linked"}
                />
                <InfoRow
                  label="near"
                  value={profile.hasNear ? (nearAccountId ?? "linked") : "not linked"}
                  mono
                />
                <InfoRow
                  label="passkeys"
                  value={profile.hasPasskeys ? `${passkeys.length} registered` : "not linked"}
                />
                <InfoRow
                  label="profile"
                  value={profile.isAnonymous ? "anonymous session" : "persistent account"}
                />
              </div>

              {profile.isAnonymous && (
                <div className="mt-2 rounded-[10px] bg-brand-accent-light border border-brand-accent-border text-foreground text-[13px] leading-relaxed px-4 py-3">
                  Link an email or NEAR wallet before signing out to keep your data.
                </div>
              )}
            </Card>
          </>
        )}

        {tenant && (
          <Card className="p-6 space-y-4">
            <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              Tenant
            </div>
            <div className="flex flex-col gap-2">
              <InfoRow label="name" value={tenant.name} />
              <InfoRow label="id" value={tenant.id} mono />
              <InfoRow label="account" value={tenant.accountId} mono />
              <InfoRow
                label="created"
                value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                to="/admin"
                preload="intent"
                className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium border-2 border-outset border-border-strong bg-card text-foreground shadow-sm hover:shadow-md active:border-inset active:shadow-none transition-all duration-200 ease-out rounded-[10px]"
              >
                manage tenant
              </Link>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { Building2, ExternalLink, Pencil, Trash2, Users } from "lucide-react";
import type { TransactionBuilder } from "near-kit";
import { useState } from "react";
import { toast } from "sonner";
import { getAccount, getActiveRuntime, useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  InfoRow,
  Input,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import {
  buildTenantPublishConfig,
  signAsDaoTransaction,
  useDaoConnection,
} from "@/lib/dao-connect";
import { useNearAccount } from "@/lib/use-near-account";
import {
  classifyTenantKey,
  resolveOrgSlug,
  resolvePrimaryHostname,
} from "../../../_admin/_dashboard/admin/tenants/-tenant-wizard";
import { TenantNodeValidators } from "./-node-validators";

const CONFIG_GAS = "300000000000000";

type PublishMode = "platform" | "dao";

async function publishTenantConfig(
  apiClient: ReturnType<typeof useApiClient>,
  auth: ReturnType<typeof useAuthClient>,
  input: {
    accountId: string;
    gatewayId: string;
    parentAccount: string;
    hostname: string | null;
    name: string;
    status?: "active" | "suspended" | "pending_deletion";
    mode: PublishMode;
  },
) {
  if (!input.hostname) {
    throw new Error("No primary domain binding configured for this tenant");
  }

  const tenantConfig = buildTenantPublishConfig({
    daoAccountId: input.accountId,
    gatewayId: input.gatewayId,
    baseAccount: input.parentAccount,
    hostname: input.hostname,
    title: input.name,
    ...(input.status ? { status: input.status } : {}),
  });

  const prepared = await apiClient.apps.prepareRegistryConfigWrite({
    accountId: input.accountId,
    gatewayId: input.gatewayId,
    config: tenantConfig as unknown as Record<string, unknown>,
  });

  if (input.mode === "dao") {
    return signAsDaoTransaction(input.accountId, {
      receiverId: prepared.data.contractId,
      methodName: prepared.data.methodName,
      args: prepared.data.args as unknown as Record<string, unknown>,
      gas: CONFIG_GAS,
      attachedDeposit: prepared.data.attachedDeposit,
    });
  }

  const relayerInfo = await auth.near.getRelayerInfo();
  const hasRelayer = relayerInfo.data?.enabled === true;

  if (hasRelayer) {
    const signed = await auth.near.buildSignedDelegateAction(
      prepared.data.contractId,
      (builder: TransactionBuilder) =>
        builder.functionCall(
          prepared.data.contractId,
          prepared.data.methodName,
          prepared.data.args,
          {
            gas: CONFIG_GAS,
            attachedDeposit: 0n,
          },
        ),
    );

    const relayed = await auth.near.relayTransaction({ payload: signed });
    if (relayed.error) throw new Error(relayed.error.message);
    return relayed;
  }

  const signerAccountId = auth.near.getAccountId();
  if (!signerAccountId) {
    throw new Error("Connect a NEAR wallet first");
  }

  return auth.near
    .getNearClient()
    .transaction(signerAccountId)
    .functionCall(prepared.data.contractId, prepared.data.methodName, prepared.data.args, {
      gas: CONFIG_GAS,
      attachedDeposit: 0n,
    })
    .send({ waitUntil: "EXECUTED" });
}

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/tenant/$tenantId")({
  head: () => ({
    meta: [{ title: "Tenant | app" }],
  }),
  component: TenantDetail,
});

function TenantDetail() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { tenantId } = Route.useParams();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const gatewayId = getActiveRuntime()?.gatewayId ?? "everything.dev";
  const parentAccount = getAccount();
  const daoConnection = useDaoConnection();

  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      const tenants = await apiClient.listTenants();
      const findById = (id: string) => tenants.find((t) => t.id === id) ?? null;
      const kind = classifyTenantKey(tenantId);
      if (kind === "uuid") {
        return findById(tenantId);
      }
      if (kind === "accountId") {
        const resolved = await apiClient.resolveTenant({ accountId: tenantId });
        return resolved ? findById(resolved.id) : null;
      }
      const binding = await apiClient
        .resolveBindingByHostname({ hostname: `${tenantId}.${gatewayId}` })
        .catch(() => null);
      if (binding) return findById(binding.tenantId);
      const node = await apiClient.resolveNodeBySlug({ slug: tenantId });
      return node ? findById(node.tenantId) : null;
    },
    enabled: !!tenantId,
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["tenant-nodes", tenantId],
    queryFn: async () => apiClient.listNodes({ tenantId }),
    enabled: !!tenantId,
  });
  const nodeSlug = nodes[0]?.slug;

  const { data: bindings } = useQuery({
    queryKey: ["tenant-bindings", tenantId],
    queryFn: async () => apiClient.listTenantBindingsForTenant({ tenantId }),
    enabled: !!tenantId,
  });

  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await auth.organization.list();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", tenant?.orgId],
    queryFn: async () => {
      if (!tenant?.orgId) return [];
      const { data, error } = await auth.organization.listMembers({
        query: { organizationId: tenant.orgId },
      });
      if (error) throw new Error(error.message);
      return (data?.members ?? []) as Array<{ userId: string; role: string }>;
    },
    enabled: !!tenant?.orgId,
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await auth.getSession();
      return data ?? null;
    },
    staleTime: 60 * 1000,
  });

  const isOwner = members.some((m) => m.userId === session?.user?.id && m.role === "owner");
  const isAdmin = members.some(
    (m) => m.userId === session?.user?.id && (m.role === "admin" || m.role === "owner"),
  );
  const isDaoOwned = tenant?.ownerKind === "dao";

  const publishMode: PublishMode = isDaoOwned ? "dao" : "platform";
  const nearAccountId = useNearAccount();
  const hasSigningWallet =
    publishMode === "dao"
      ? daoConnection.status === "connected" && daoConnection.daoAccountId === tenant?.accountId
      : !!nearAccountId;

  const hostname = resolvePrimaryHostname(bindings);
  const orgSlug = resolveOrgSlug(organizations, tenant?.orgId);
  const bosUrl = tenant ? `bos://${tenant.accountId}/${gatewayId}` : null;
  const fastKvUrl = tenant ? buildRegistryConfigUrl(tenant.accountId, gatewayId) : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant not loaded");
      const updated = await apiClient.updateTenant({ tenantId, name });
      if (name !== updated.name) {
        await publishTenantConfig(apiClient, auth, {
          accountId: updated.accountId,
          gatewayId,
          parentAccount,
          hostname,
          name: updated.name,
          status: updated.status === "active" ? "active" : undefined,
          mode: publishMode,
        });
      }
      return updated;
    },
    onSuccess: () => {
      toast.success("Tenant updated");
      setEditing(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update tenant"),
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      const updated = await apiClient.suspendTenant({ tenantId });
      await publishTenantConfig(apiClient, auth, {
        accountId: updated.accountId,
        gatewayId,
        parentAccount,
        hostname,
        name: updated.name,
        status: "suspended",
        mode: publishMode,
      });
      return updated;
    },
    onSuccess: () => {
      toast.success("Tenant suspended");
      invalidate();
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const updated = await apiClient.reactivateTenant({ tenantId });
      await publishTenantConfig(apiClient, auth, {
        accountId: updated.accountId,
        gatewayId,
        parentAccount,
        hostname,
        name: updated.name,
        status: "active",
        mode: publishMode,
      });
      return updated;
    },
    onSuccess: () => {
      toast.success("Tenant reactivated");
      invalidate();
    },
  });

  const republishMutation = useMutation({
    mutationFn: async () => {
      return publishTenantConfig(apiClient, auth, {
        accountId: tenant?.accountId ?? "",
        gatewayId,
        parentAccount,
        hostname,
        name: tenant?.name ?? "",
        status:
          tenant?.status === "suspended" || tenant?.status === "pending_deletion"
            ? tenant?.status
            : undefined,
        mode: publishMode,
      });
    },
    onSuccess: () => toast.success("Config republished"),
    onError: (error: Error) => toast.error(error.message || "Failed to republish config"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const updated = await apiClient.deleteTenant({ tenantId });
      await publishTenantConfig(apiClient, auth, {
        accountId: updated.accountId,
        gatewayId,
        parentAccount,
        hostname,
        name: updated.name,
        status: "pending_deletion",
        mode: publishMode,
      });
      return updated;
    },
    onSuccess: () => {
      toast.success("Tenant queued for deletion");
      setDeleteOpen(false);
      router.navigate({ to: "/" });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete tenant"),
  });

  if (!tenant) {
    return (
      <PageContainer variant="wide">
        <div className="text-muted-foreground text-sm py-12">Tenant not found.</div>
      </PageContainer>
    );
  }

  const statusVariant =
    tenant.status === "active"
      ? "default"
      : tenant.status === "suspended"
        ? "destructive"
        : "secondary";

  const republishTooltip = !hostname
    ? "create a domain binding before republishing"
    : !hasSigningWallet
      ? isDaoOwned
        ? "connect the DAO account via Trezu to republish"
        : "connect your NEAR session wallet to republish"
      : undefined;

  const canRepublish = !!hostname && hasSigningWallet;

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard">dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{nodeSlug ?? tenant.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          icon={Building2}
          label="Tenant"
          title={tenant.name}
          subtitle={`${hostname ?? "no binding yet"} · ${tenant.accountId}`}
          actions={
            <div className="flex gap-2">
              <Badge variant={isDaoOwned ? "default" : "secondary"}>
                {isDaoOwned ? "DAO-owned" : (tenant.ownerKind ?? "platform")}
              </Badge>
              <Badge variant={statusVariant as "default" | "destructive" | "secondary"}>
                {tenant.status}
              </Badge>
              {isAdmin && tenant.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => suspendMutation.mutate()}
                  disabled={suspendMutation.isPending}
                >
                  suspend
                </Button>
              )}
              {isAdmin && tenant.status === "suspended" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reactivateMutation.mutate()}
                  disabled={reactivateMutation.isPending}
                >
                  reactivate
                </Button>
              )}
              {isOwner && tenant.status === "active" && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  delete
                </Button>
              )}
            </div>
          }
        />

        {isDaoOwned && (
          <section className="space-y-3">
            <SectionHeader title="DAO connection" />
            <ConnectDao />
          </section>
        )}

        <section className="space-y-3">
          <SectionHeader
            title="Details"
            action={
              isOwner && !editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setName(tenant.name);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  edit
                </Button>
              ) : undefined
            }
          />
          <Card>
            <CardContent className="p-6 space-y-4">
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateMutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <InfoRow
                    label="name"
                    value={
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="max-w-xs"
                      />
                    }
                  />
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                      save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(false)}
                    >
                      cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <InfoRow label="name" value={tenant.name} />
                  <InfoRow label="hostname" value={hostname ?? "—"} mono />
                  <InfoRow label="account" value={tenant.accountId} mono />
                  <InfoRow label="owner kind" value={isDaoOwned ? "dao" : "platform"} />
                  <InfoRow
                    label="registry"
                    value={
                      bosUrl && fastKvUrl ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs">{bosUrl}</code>
                          <a
                            href={fastKvUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline text-muted-foreground hover:text-foreground"
                          >
                            view published config on FastKV
                          </a>
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <InfoRow label="org id" value={tenant.orgId} mono />
                  <InfoRow label="status" value={tenant.status} />
                  <InfoRow
                    label="created"
                    value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
                  />
                  <InfoRow
                    label="updated"
                    value={tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : "—"}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Live site" />
          <Card className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Your tenant is served at the binding hostname below. The site resolves through the
              parent gateway's host.
            </p>
            {hostname && (
              <Button asChild variant="outline" size="sm">
                <a href={`https://${hostname}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  open {hostname}
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => republishMutation.mutate()}
              disabled={republishMutation.isPending || !canRepublish}
              title={republishTooltip}
            >
              republish config
            </Button>
            {!canRepublish && <p className="text-xs text-muted-foreground">{republishTooltip}</p>}
          </Card>
        </section>

        <TenantNodeValidators tenantId={tenant.id} canManage={isAdmin} />

        <section className="space-y-3">
          <SectionHeader title="Members & permissions" />
          <Card className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This tenant is backed by an organization. Manage members, roles, and invitations
              there.
            </p>
            {orgSlug && (
              <Button asChild variant="outline" size="sm">
                <Link to="/orgs/$slug" params={{ slug: orgSlug }}>
                  <Users className="h-3.5 w-3.5" />
                  open organization
                </Link>
              </Button>
            )}
          </Card>
        </section>

        {isOwner && (
          <section className="space-y-3">
            <SectionHeader title="Danger zone" />
            <Card className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Deleting a tenant suspends it immediately and permanently removes it after a 30-day
                grace period.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                delete tenant
              </Button>
            </Card>
          </section>
        )}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this tenant?"
          description="The tenant will be suspended immediately and permanently deleted after 30 days. This cannot be undone."
          confirmLabel="delete tenant"
          variant="destructive"
          onConfirm={() => deleteMutation.mutate()}
          isPending={deleteMutation.isPending}
        />
      </div>
    </PageContainer>
  );
}

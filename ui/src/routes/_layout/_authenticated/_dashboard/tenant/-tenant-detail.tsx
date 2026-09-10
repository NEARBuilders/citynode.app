import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  getAccount,
  getActiveRuntime,
  type RouterContext,
  useApiClient,
  useAuthClient,
} from "@/app";
import { PageContainer, SectionHeader } from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import { tenantNodesQueryOptions } from "@/lib/queries/nodes";
import { tenantBindingsQueryOptions, tenantByKeyQueryOptions } from "@/lib/queries/tenants";
import { publishTenantConfigForMode, type TenantConfigPublishMode } from "@/lib/tenant-deploy";
import {
  resolveOrgSlug,
  resolvePrimaryHostname,
} from "../../../_admin/_dashboard/admin/tenants/-tenant-wizard";
import { TenantNodeValidators } from "./-node-validators";
import { TenantDangerZone } from "./-tenant-danger-zone";
import { TenantDetails } from "./-tenant-details";
import { TenantHeader } from "./-tenant-header";
import { TenantLiveSite } from "./-tenant-live-site";
import { TenantMembers } from "./-tenant-members";
import {
  invalidatePersistedTenantQueries,
  publishPersistedTenantChange,
} from "./-tenant-mutations";
import { TenantUnavailable } from "./-tenant-unavailable";

export function TenantDetailContent({
  tenantId,
  runtimeConfig,
}: {
  tenantId: string;
  runtimeConfig?: RouterContext["runtimeConfig"];
}) {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId;
  const parentAccount = getAccount(runtimeConfig);

  const assertGateway = (): string => {
    if (!gatewayId) {
      throw new Error(
        "Cannot publish the tenant config — no gateway id is resolved from the runtime. Set bos.config.json's `domain` for this build.",
      );
    }
    return gatewayId;
  };

  const { data: tenant } = useQuery({
    ...tenantByKeyQueryOptions(apiClient, tenantId, gatewayId ?? ""),
    enabled: !!tenantId && !!gatewayId,
  });

  const { data: nodes = [] } = useQuery({
    ...tenantNodesQueryOptions(apiClient, tenantId),
    enabled: !!tenantId,
  });
  const nodeSlug = nodes[0]?.slug;

  const { data: bindings } = useQuery({
    ...tenantBindingsQueryOptions(apiClient, tenantId),
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

  const publishMode: TenantConfigPublishMode = isDaoOwned ? "dao" : "platform";

  const hostname = resolvePrimaryHostname(bindings);
  const orgSlug = resolveOrgSlug(organizations, tenant?.orgId);

  async function finishPersistedChange(message: string, publicationError: Error | null) {
    const refreshError = await invalidatePersistedTenantQueries(queryClient);
    if (publicationError) {
      toast.error(`${message}, but config publication failed: ${publicationError.message}`);
    } else {
      toast.success(message);
    }
    if (refreshError) {
      toast.warning(`${message}, but tenant data could not refresh.`);
    }
    return { publicationError, refreshError };
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const gid = assertGateway();
      if (!tenant) throw new Error("Tenant not loaded");
      const updated = await apiClient.updateTenant({ tenantId, name });
      return name !== updated.name
        ? publishPersistedTenantChange(updated, () =>
            publishTenantConfigForMode(apiClient, auth, {
              accountId: updated.accountId,
              gatewayId: gid,
              baseAccount: parentAccount,
              hostname,
              title: updated.name,
              status: updated.status === "active" ? "active" : undefined,
              mode: publishMode,
            }),
          )
        : { updated, publicationError: null };
    },
    onSuccess: async ({ publicationError }) => {
      await finishPersistedChange("Tenant updated", publicationError);
      setEditing(false);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update tenant"),
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      const gid = assertGateway();
      const updated = await apiClient.suspendTenant({ tenantId });
      return publishPersistedTenantChange(updated, () =>
        publishTenantConfigForMode(apiClient, auth, {
          accountId: updated.accountId,
          gatewayId: gid,
          baseAccount: parentAccount,
          hostname,
          title: updated.name,
          status: "suspended",
          mode: publishMode,
        }),
      );
    },
    onSuccess: async ({ publicationError }) => {
      await finishPersistedChange("Tenant suspended", publicationError);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const gid = assertGateway();
      const updated = await apiClient.reactivateTenant({ tenantId });
      return publishPersistedTenantChange(updated, () =>
        publishTenantConfigForMode(apiClient, auth, {
          accountId: updated.accountId,
          gatewayId: gid,
          baseAccount: parentAccount,
          hostname,
          title: updated.name,
          status: "active",
          mode: publishMode,
        }),
      );
    },
    onSuccess: async ({ publicationError }) => {
      await finishPersistedChange("Tenant reactivated", publicationError);
    },
  });

  const republishMutation = useMutation({
    mutationFn: async () => {
      const gid = assertGateway();
      return publishTenantConfigForMode(apiClient, auth, {
        accountId: tenant?.accountId ?? "",
        gatewayId: gid,
        baseAccount: parentAccount,
        hostname,
        title: tenant?.name ?? "",
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
      const gid = assertGateway();
      const updated = await apiClient.deleteTenant({ tenantId });
      return publishPersistedTenantChange(updated, () =>
        publishTenantConfigForMode(apiClient, auth, {
          accountId: updated.accountId,
          gatewayId: gid,
          baseAccount: parentAccount,
          hostname,
          title: updated.name,
          status: "pending_deletion",
          mode: publishMode,
        }),
      );
    },
    onSuccess: async ({ publicationError }) => {
      if (publicationError) {
        await finishPersistedChange("Tenant deletion saved", publicationError);
        return;
      }
      await finishPersistedChange("Tenant queued for deletion", null);
      setDeleteOpen(false);
      await router.navigate({ to: "/" });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete tenant"),
  });

  if (!tenant || !gatewayId) return <TenantUnavailable gatewayId={gatewayId} />;
  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <TenantHeader
          tenant={tenant}
          hostname={hostname}
          nodeSlug={nodeSlug}
          isOwner={isOwner}
          isAdmin={isAdmin}
          suspend={suspendMutation}
          reactivate={reactivateMutation}
          deleting={deleteMutation.isPending}
          onDelete={() => setDeleteOpen(true)}
        />
        {isDaoOwned && (
          <section className="space-y-3">
            <SectionHeader title="DAO connection" />
            <ConnectDao />
          </section>
        )}

        <TenantDetails
          tenant={tenant}
          hostname={hostname}
          gatewayId={gatewayId}
          isOwner={isOwner}
          editor={{
            editing,
            name,
            isPending: updateMutation.isPending,
            onEdit: () => {
              setName(tenant.name);
              setEditing(true);
            },
            onCancel: () => setEditing(false),
            onSave: () => updateMutation.mutate(),
            onNameChange: setName,
          }}
        />
        <TenantLiveSite
          tenant={tenant}
          hostname={hostname}
          gatewayId={gatewayId}
          republish={republishMutation}
        />
        <TenantNodeValidators tenantId={tenant.id} canManage={isAdmin} />
        <TenantMembers orgSlug={orgSlug} />
        <TenantDangerZone
          isOwner={isOwner}
          open={deleteOpen}
          isPending={deleteMutation.isPending}
          onOpen={() => setDeleteOpen(true)}
          onOpenChange={setDeleteOpen}
          onConfirm={() => deleteMutation.mutate()}
        />
      </div>
    </PageContainer>
  );
}

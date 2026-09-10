import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { ExternalLink, FlaskConical, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  InfoPopover,
  InfoRow,
  Input,
  SectionHeader,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import { Spinner } from "@/components/ui/spinner";
import { describeDaoError, useDaoConnection } from "@/lib/dao-connect";
import {
  invalidateTenantQueries,
  tenantBindingsQueryOptions,
  tenantByOrgQueryOptions,
} from "@/lib/queries/tenants";
import {
  ANY_RECEIVER,
  approvalThreshold,
  type DaoPlan,
  fetchDaoProposals,
  fetchSputnikPolicy,
  findPendingProposalForPlan,
} from "@/lib/sputnik-proposals";
import {
  buildDraftFromResolvedConfig,
  computeSubresourceIntegrity,
  diffDraft,
  draftUiOverride,
  emptyTenantConfigDraft,
  type TenantConfigDraft,
  tenantConfigDraftSchema,
  verifyUiIntegrity,
} from "@/lib/tenant-config-draft";
import { publishTenantConfigForMode } from "@/lib/tenant-deploy";
import { buildTenantUrl } from "@/lib/tenant-url";
import { useNearAccount } from "@/lib/use-near-account";
import { resolvePrimaryHostname } from "../../../_admin/_dashboard/admin/tenants/-tenant-wizard";
import { waitFor } from "../-poc-chain";

const REFETCH_MS = 15_000;

const CONFIG_WRITE_PLAN: DaoPlan = {
  kind: "call",
  receiverId: ANY_RECEIVER,
  methodName: "__fastdata_kv",
  args: {},
  gas: "300 Tgas",
};

export interface NodeConfigTabProps {
  orgId: string;
  gatewayId: string;
  baseAccount: string;
  canManage: boolean;
}

export function NodeConfigTab({ orgId, gatewayId, baseAccount, canManage }: NodeConfigTabProps) {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const connection = useDaoConnection();
  const nearAccountId = useNearAccount();

  const { data: tenant } = useQuery(tenantByOrgQueryOptions(apiClient, orgId));

  const daoOwned = tenant?.ownerKind === "dao";
  const tenantAccount = tenant?.accountId ?? "";

  const { data: bindings } = useQuery({
    ...tenantBindingsQueryOptions(apiClient, tenant?.id ?? ""),
    enabled: !!tenant,
  });
  const hostname = resolvePrimaryHostname(bindings);

  const registryQuery = useQuery({
    queryKey: ["node-config", "registry-app", tenantAccount, gatewayId],
    queryFn: async () => {
      try {
        const result = await apiClient.apps.getRegistryApp({
          accountId: tenantAccount,
          gatewayId,
        });
        return result.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!tenant && !!gatewayId,
    refetchInterval: REFETCH_MS,
  });
  const registryApp = registryQuery.data;
  const resolvedConfig = registryApp?.resolvedConfig ?? null;
  const configPublished = !!registryApp;

  const { data: daoProposals = [] } = useQuery({
    queryKey: ["node-config", "dao-proposals", tenantAccount],
    queryFn: () => fetchDaoProposals(tenantAccount),
    enabled: daoOwned && !!tenantAccount,
    refetchInterval: REFETCH_MS,
  });
  const { data: daoPolicy } = useQuery({
    queryKey: ["node-config", "dao-policy", tenantAccount],
    queryFn: () => fetchSputnikPolicy(tenantAccount),
    enabled: daoOwned && !!tenantAccount,
    refetchInterval: REFETCH_MS,
  });

  const pendingConfigProposal = daoOwned
    ? findPendingProposalForPlan(daoProposals, CONFIG_WRITE_PLAN)
    : null;
  const pendingThreshold = approvalThreshold(daoPolicy, pendingConfigProposal);

  const [draft, setDraft] = useState<TenantConfigDraft>(emptyTenantConfigDraft);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !tenant || !registryQuery.isSuccess) return;
    setPrefilled(true);
    setDraft(buildDraftFromResolvedConfig(resolvedConfig, { title: tenant.name }));
  }, [prefilled, tenant, registryQuery.isSuccess, resolvedConfig]);

  const parsedDraft = tenantConfigDraftSchema.safeParse(draft);
  const diff = useMemo(() => diffDraft(draft, resolvedConfig), [draft, resolvedConfig]);

  const tenantUrl = hostname ? buildTenantUrl(hostname, gatewayId) : null;
  const fastKvUrl = tenantAccount ? buildRegistryConfigUrl(tenantAccount, gatewayId) : null;

  const editable = canManage && tenant?.status === "active";
  const hasSigningWallet = daoOwned
    ? connection.status === "connected" && connection.daoAccountId === tenantAccount
    : !!nearAccountId;

  const [verifying, setVerifying] = useState(false);
  const [computing, setComputing] = useState(false);

  const fetchPublishedNow = () =>
    apiClient.apps
      .getRegistryApp({ accountId: tenantAccount, gatewayId })
      .then((result) => result.data ?? null)
      .catch(() => null);

  const configMatchesDraft = (resolved: Record<string, unknown> | null | undefined) =>
    !!resolved &&
    resolved.title === draft.title.trim() &&
    (!draft.uiProduction ||
      ((resolved.app as { ui?: { production?: string } } | undefined)?.ui?.production ?? "") ===
        draft.uiProduction.trim());

  const proposeMutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant not loaded");
      if (!gatewayId) throw new Error("Gateway not configured");
      if (!hostname) throw new Error("No primary domain binding configured for this tenant");
      const value = tenantConfigDraftSchema.parse(draft);
      const app = draftUiOverride(value);
      if (value.title !== tenant.name) {
        await apiClient.updateTenant({ tenantId: tenant.id, name: value.title });
      }
      return publishTenantConfigForMode(apiClient, auth, {
        accountId: tenant.accountId,
        gatewayId,
        baseAccount,
        hostname,
        title: value.title,
        description: value.description,
        ...(value.repository ? { repository: value.repository } : {}),
        ...(app ? { app } : {}),
        mode: daoOwned ? "dao" : "platform",
      });
    },
    onSuccess: async () => {
      if (daoOwned) {
        const live = await waitFor(
          async () => {
            const latest = await fetchPublishedNow();
            return configMatchesDraft(latest?.resolvedConfig ?? null);
          },
          30_000,
          3_000,
        );
        if (live) {
          toast.success(`config is live — ${tenantUrl ?? hostname}`);
        } else {
          toast.info("publish proposal awaiting votes — the config goes live once it passes");
        }
      } else {
        toast.success("config published");
      }
      await invalidateTenantQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["node-config"] });
    },
    onError: (error: Error) =>
      toast.error(describeDaoError(error, daoOwned ? tenantAccount : "the session wallet")),
  });

  const onVerifyBundle = async () => {
    if (!draft.uiProduction) {
      toast.error("enter the UI bundle URL first");
      return;
    }
    setComputing(true);
    try {
      const computed = await computeSubresourceIntegrity(draft.uiProduction);
      if (!draft.uiIntegrity) {
        setDraft((prev) => ({ ...prev, uiIntegrity: computed }));
        toast.success("integrity filled from the bundle");
        return;
      }
      if (computed === draft.uiIntegrity) {
        toast.success("integrity matches the bundle");
      } else {
        toast.error(`integrity mismatch — the bundle hashes to ${computed}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setComputing(false);
    }
  };

  const onPropose = async () => {
    if (!parsedDraft.success) {
      toast.error(parsedDraft.error.issues[0]?.message ?? "fix the form first");
      return;
    }
    const value = parsedDraft.data;
    if (value.uiProduction && value.uiIntegrity) {
      setVerifying(true);
      try {
        const check = await verifyUiIntegrity(value.uiProduction, value.uiIntegrity);
        if (check.status === "mismatch") {
          toast.error(`integrity mismatch — the bundle hashes to ${check.computed}`);
          return;
        }
        if (
          check.status === "unverified" &&
          !confirm(`couldn't fetch the bundle to verify (${check.reason}) — propose anyway?`)
        ) {
          return;
        }
      } finally {
        setVerifying(false);
      }
    }
    proposeMutation.mutate();
  };

  if (!tenant || !gatewayId) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6" data-testid="orgs-node-config-empty">
          {!gatewayId ? (
            <p className="text-sm text-muted-foreground">
              The active runtime does not declare a gateway, so tenant config cannot be resolved
              here.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                This organization has no node yet. Run the node lifecycle to apply, get approved,
                and publish a tenant config first.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/prototype-staking-poc">
                  <FlaskConical className="h-3.5 w-3.5" />
                  open the node lifecycle
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const busy = proposeMutation.isPending || verifying || computing;
  const proposeBlockReason = !editable
    ? !canManage
      ? "organization owners and admins can propose config changes"
      : `tenant is ${tenant.status}`
    : !parsedDraft.success
      ? (parsedDraft.error.issues[0]?.message ?? "fix the form first")
      : !hasSigningWallet
        ? daoOwned
          ? `connect ${tenantAccount} via Trezu to propose`
          : "connect your NEAR wallet to publish"
        : null;
  const canPropose = editable && parsedDraft.success && hasSigningWallet && !busy;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionHeader
            title="Published config"
            sectionTestId="orgs-node-config-state"
            action={
              <InfoPopover
                title="Tenant config"
                body="The tenant's bos.config.json, published on-chain in FastKV and served by the platform host at the binding hostname. DAO-owned tenants publish changes as proposals that go live once passed."
                links={fastKvUrl ? [{ label: "view on FastKV", href: fastKvUrl }] : []}
              />
            }
          />
          <InfoRow
            label="config"
            value={
              <span
                className="inline-flex flex-wrap items-center gap-2"
                data-testid="orgs-node-config-config"
              >
                {configPublished ? (
                  <Badge variant="success" className="text-[10px]">
                    live
                  </Badge>
                ) : pendingConfigProposal ? (
                  <Badge variant="warning" className="text-[10px]">
                    awaiting votes #{pendingConfigProposal.id}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    not published
                  </Badge>
                )}
                {fastKvUrl && (
                  <a
                    href={fastKvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                  >
                    view on FastKV
                  </a>
                )}
              </span>
            }
          />
          <InfoRow
            label="hostname"
            value={
              tenantUrl && configPublished ? (
                <a
                  href={tenantUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                  data-testid="orgs-node-config-open-tenant"
                >
                  {tenantUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                (hostname ?? "—")
              )
            }
            mono
          />
          <InfoRow label="owner" value={daoOwned ? "DAO — changes go live by vote" : "platform"} />
          <InfoRow
            label="account"
            value={
              fastKvUrl ? (
                <a
                  href={fastKvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                >
                  {tenantAccount}
                </a>
              ) : (
                tenantAccount
              )
            }
            mono
          />
          {pendingConfigProposal && (
            <InfoRow
              label="pending proposal"
              value={`#${pendingConfigProposal.id} · ${pendingThreshold.approved}${
                pendingThreshold.required == null ? "" : `/${pendingThreshold.required}`
              } approvals`}
              mono
            />
          )}
          <InfoRow
            label="ui overrides"
            value={
              <Badge
                variant={tenant.allowUiOverrides ? "default" : "outline"}
                className="text-[10px]"
              >
                {tenant.allowUiOverrides ? "allowed" : "disabled"}
              </Badge>
            }
          />
          <InfoRow
            label="ssr"
            value={
              <Badge variant={tenant.allowSsr ? "default" : "outline"} className="text-[10px]">
                {tenant.allowSsr ? "allowed" : "off"}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      {daoOwned && <ConnectDao />}

      <Card>
        <CardContent className="space-y-4 p-4">
          <SectionHeader
            title="Customize"
            sectionTestId="orgs-node-config-editor"
            action={
              <InfoPopover
                title="Propose your own config"
                body="Edits here re-publish the tenant's config: metadata always, and a custom UI bundle when overrides are allowed. The platform host serves the tenant's own UI bundle once the config is live."
              />
            }
          />

          {!editable && (
            <p className="text-xs text-muted-foreground" data-testid="orgs-node-config-locked">
              {proposeBlockReason}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ConfigField
              id="orgs-node-config-title"
              label="Title"
              value={draft.title}
              onChange={(value) => setDraft((prev) => ({ ...prev, title: value }))}
              disabled={!editable}
            />
            <ConfigField
              id="orgs-node-config-description"
              label="Description"
              value={draft.description}
              onChange={(value) => setDraft((prev) => ({ ...prev, description: value }))}
              disabled={!editable}
            />
            <ConfigField
              id="orgs-node-config-repository"
              label="Repository"
              value={draft.repository}
              onChange={(value) => setDraft((prev) => ({ ...prev, repository: value }))}
              placeholder="https://github.com/…"
              disabled={!editable}
            />
          </div>

          {tenant.allowUiOverrides ? (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Custom UI bundle</h3>
                <InfoPopover
                  title="Custom UI bundle"
                  body="A deployed UI bundle (URL + sha384 integrity) that replaces the platform UI for this tenant. Verify before proposing — a mismatching pair makes the host refuse the tenant until it is fixed."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <ConfigField
                    id="orgs-node-config-ui-url"
                    label="UI bundle URL"
                    value={draft.uiProduction}
                    onChange={(value) => setDraft((prev) => ({ ...prev, uiProduction: value }))}
                    placeholder="https://…zephyrcloud.app"
                    disabled={!editable}
                  />
                  <button
                    type="button"
                    onClick={() => void onVerifyBundle()}
                    disabled={!editable || computing || !draft.uiProduction}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                    data-testid="orgs-node-config-verify"
                  >
                    {computing ? "hashing…" : "verify · fill integrity from the bundle"}
                  </button>
                </div>
                <ConfigField
                  id="orgs-node-config-ui-integrity"
                  label="UI integrity"
                  value={draft.uiIntegrity}
                  onChange={(value) => setDraft((prev) => ({ ...prev, uiIntegrity: value }))}
                  placeholder="sha384-…"
                  mono
                  disabled={!editable}
                />
                {tenant.allowSsr && (
                  <>
                    <ConfigField
                      id="orgs-node-config-ssr-url"
                      label="SSR bundle URL"
                      value={draft.ssrUrl}
                      onChange={(value) => setDraft((prev) => ({ ...prev, ssrUrl: value }))}
                      placeholder="https://…"
                      disabled={!editable}
                    />
                    <ConfigField
                      id="orgs-node-config-ssr-integrity"
                      label="SSR integrity"
                      value={draft.ssrIntegrity}
                      onChange={(value) => setDraft((prev) => ({ ...prev, ssrIntegrity: value }))}
                      placeholder="sha384-…"
                      mono
                      disabled={!editable}
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              UI overrides are disabled for this tenant — the platform UI is served as-is.
            </p>
          )}

          {diff.length > 0 && (
            <div
              className="space-y-1 border-t border-border pt-3"
              data-testid="orgs-node-config-diff"
            >
              <p className="text-xs font-semibold text-foreground">changes</p>
              {diff.map((entry) => (
                <p
                  key={entry.field}
                  className="truncate font-mono text-[11px] text-muted-foreground"
                >
                  {entry.field}: <span className="text-foreground">{entry.from || "—"}</span> →{" "}
                  <span className="text-foreground">{entry.to || "—"}</span>
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              onClick={() => void onPropose()}
              disabled={!canPropose}
              title={proposeBlockReason ?? undefined}
              data-testid="orgs-node-config-propose"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {daoOwned ? "propose config" : "publish config"}
            </Button>
            {proposeBlockReason && !editable ? null : (
              <span className="text-xs text-muted-foreground">
                {proposeBlockReason ??
                  (daoOwned
                    ? "the config goes live when the DAO proposal passes"
                    : "published immediately")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={mono ? "font-mono text-xs" : undefined}
        data-testid={id}
      />
    </Field>
  );
}

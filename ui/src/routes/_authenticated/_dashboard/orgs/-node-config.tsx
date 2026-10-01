import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  FlaskIcon,
  GearSixIcon,
  ShieldCheckIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildDraftFromResolvedConfig,
  buildTenantUrl,
  computeSsrEntryIntegrity,
  computeUiEntryIntegrity,
  createTenantConfigDraftSchema,
  diffDraft,
  draftUiOverride,
  emptyTenantConfigDraft,
  type IntegrityCheckResult,
  normalizeBundleBaseUrl,
  type TenantConfigDraft,
  useApiClient,
  useAuthClient,
  verifySsrIntegrity,
  verifyUiIntegrity,
} from "@/app";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  FieldLabel,
  InfoPopover,
  InfoRow,
  Input,
  SectionHeader,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { describeDaoError, useDaoConnection } from "@/lib/dao-connect";
import { presentationLabel } from "@/lib/presentation-label";
import {
  invalidateTenantQueries,
  tenantBindingsQueryOptions,
  tenantByOrgQueryOptions,
} from "@/lib/queries/tenants";
import {
  approvalThreshold,
  CONFIG_WRITE_PLAN,
  fetchDaoProposals,
  fetchSputnikPolicy,
  findPendingProposalForPlan,
} from "@/lib/sputnik-proposals";
import { publishTenantConfigForMode } from "@/lib/tenant-deploy";
import { useNearAccount } from "@/lib/use-near-account";
import { resolvePrimaryHostname } from "../../../_admin/_dashboard/admin/tenants/-tenant-wizard";
import { waitFor } from "../-poc-chain";

const REFETCH_MS = 15_000;

export interface NodeConfigTabProps {
  orgId: string;
  gatewayId: string;
  baseAccount: string;
  canManage: boolean;
  isPlatformAdmin?: boolean;
}

export function NodeConfigTab({
  orgId,
  gatewayId,
  baseAccount,
  canManage,
  isPlatformAdmin = false,
}: NodeConfigTabProps) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const connection = useDaoConnection();
  const nearAccountId = useNearAccount();
  const activeNetwork = auth.useActiveNetwork();

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

  const draftSchema = createTenantConfigDraftSchema({
    url: translate("nodeConfig.urlInvalid"),
    integrity: translate("nodeConfig.integrityInvalid"),
    title: translate("nodeConfig.titleRequired"),
    description: translate("nodeConfig.descriptionRequired"),
    uiPair: translate("nodeConfig.uiPairRequired"),
    ssrPair: translate("nodeConfig.ssrPairRequired"),
  });
  const parsedDraft = draftSchema.safeParse(draft);
  const diff = useMemo(() => diffDraft(draft, resolvedConfig), [draft, resolvedConfig]);

  const tenantUrl = hostname ? buildTenantUrl(hostname, gatewayId) : null;
  const fastKvUrl = tenantAccount ? buildRegistryConfigUrl(tenantAccount, gatewayId) : null;

  const editable = canManage && tenant?.status === "active";
  const hasSigningWallet = daoOwned
    ? connection.status === "connected" && connection.daoAccountId === tenantAccount
    : nearAccountId === tenantAccount &&
      activeNetwork === (tenantAccount.endsWith(".testnet") ? "testnet" : "mainnet");

  const [verifying, setVerifying] = useState(false);
  const [computing, setComputing] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [showBundle, setShowBundle] = useState(false);
  const [sourceAccount, setSourceAccount] = useState("");
  const [fetchingSource, setFetchingSource] = useState(false);

  const onFillFromDeployedApp = async () => {
    const account = sourceAccount.trim();
    if (!account) {
      toast.error(translate("tenant.deployedAccountRequired"));
      return;
    }
    setFetchingSource(true);
    try {
      const result = await apiClient.apps.getRegistryApp({ accountId: account, gatewayId });
      const resolved = result.data?.resolvedConfig ?? null;
      const ui =
        (resolved?.app as { ui?: { production?: unknown; integrity?: unknown } } | null)?.ui ?? {};
      const production = typeof ui.production === "string" ? ui.production : "";
      const integrity = typeof ui.integrity === "string" ? ui.integrity : "";
      if (!production || !integrity) {
        toast.error(translate("tenant.noCustomBundle", { account: account ?? "" }));
        return;
      }
      const ssr =
        (resolved?.app as { ui?: { ssr?: unknown; ssrIntegrity?: unknown } } | null)?.ui ?? {};
      const ssrUrl = typeof ssr.ssr === "string" ? ssr.ssr : "";
      const ssrIntegrity = typeof ssr.ssrIntegrity === "string" ? ssr.ssrIntegrity : "";
      setDraft((prev) => ({
        ...prev,
        uiProduction: production,
        uiIntegrity: integrity,
        ...(tenant?.allowSsr && ssrUrl && ssrIntegrity ? { ssrUrl, ssrIntegrity } : {}),
      }));
      toast.success(translate("tenant.bundleFilled", { account: account ?? "" }));
    } catch {
      toast.error(translate("tenant.noPublishedConfig", { account: account ?? "" }));
    } finally {
      setFetchingSource(false);
    }
  };

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
      const value = draftSchema.parse(draft);
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
          toast.success(
            translate("tenant.configLiveNamed", { url: String(tenantUrl ?? hostname ?? "") }),
          );
        } else {
          toast.info(translate("tenant.proposalSubmitted"));
        }
      } else {
        toast.success(translate("tenant.configPublished"));
      }
      await invalidateTenantQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["node-config"] });
    },
    onError: (error: Error) =>
      toast.error(
        describeDaoError(
          error,
          daoOwned ? tenantAccount : translate("wallet.sessionAccount"),
          translate,
        ),
      ),
  });

  const onVerifyBundle = async (
    url: string,
    currentIntegrity: string,
    compute: (url: string) => Promise<string>,
    apply: (computed: string) => void,
    label: string,
  ) => {
    setComputing(true);
    try {
      const computed = await compute(url);
      if (!currentIntegrity) {
        apply(computed);
        toast.success(translate("tenant.integrityFilled", { label: label ?? "" }));
        return;
      }
      if (computed === currentIntegrity) {
        toast.success(translate("tenant.integrityMatches", { label: label ?? "" }));
      } else {
        toast.error(
          translate("tenant.integrityMismatch", { label: label ?? "", hash: computed ?? "" }),
        );
      }
    } catch (error) {
      toast.error(appErrorMessage(error, translate));
    } finally {
      setComputing(false);
    }
  };

  const onVerifyUiBundle = () => {
    if (!draft.uiProduction) {
      toast.error(translate("tenant.uiUrlRequired"));
      return;
    }
    return onVerifyBundle(
      draft.uiProduction,
      draft.uiIntegrity,
      computeUiEntryIntegrity,
      (computed) => setDraft((prev) => ({ ...prev, uiIntegrity: computed })),
      "UI",
    );
  };

  const onVerifySsrBundle = () => {
    if (!draft.ssrUrl) {
      toast.error(translate("tenant.ssrUrlRequired"));
      return;
    }
    return onVerifyBundle(
      draft.ssrUrl,
      draft.ssrIntegrity,
      computeSsrEntryIntegrity,
      (computed) => setDraft((prev) => ({ ...prev, ssrIntegrity: computed })),
      "SSR",
    );
  };

  const onPropose = async () => {
    if (!parsedDraft.success) {
      toast.error(parsedDraft.error.issues[0]?.message ?? translate("nodeConfig.fixForm"));
      return;
    }
    const value = parsedDraft.data;
    const checks: { label: string; check: IntegrityCheckResult }[] = [];
    if (value.uiProduction && value.uiIntegrity) {
      setVerifying(true);
      try {
        checks.push({
          label: "UI",
          check: await verifyUiIntegrity(value.uiProduction, value.uiIntegrity),
        });
      } finally {
        setVerifying(false);
      }
    }
    if (value.ssrUrl && value.ssrIntegrity) {
      setVerifying(true);
      try {
        checks.push({
          label: "SSR",
          check: await verifySsrIntegrity(value.ssrUrl, value.ssrIntegrity),
        });
      } finally {
        setVerifying(false);
      }
    }
    for (const { label, check } of checks) {
      if (check.status === "mismatch") {
        toast.error(
          translate("tenant.integrityMismatch", { label: label ?? "", hash: check.computed ?? "" }),
        );
        return;
      }
      if (check.status === "unverified") {
        setUnverified(label);
        return;
      }
    }
    proposeMutation.mutate();
  };

  if (!tenant || !gatewayId) {
    return (
      <div data-testid="orgs-node-config-empty">
        {!gatewayId ? (
          <EmptyState
            icon={StackIcon}
            title={translate("tenant.noGateway")}
            description={translate("tenant.noGatewayDescription")}
          />
        ) : (
          <EmptyState
            icon={StackIcon}
            title={translate("tenant.noCommunity")}
            description={translate("tenant.startHint")}
            action={
              <>
                <Button nativeButton={false} render={<Link to="/apply" />}>
                  {translate("community.start")}
                </Button>
                {isPlatformAdmin && (
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link to="/prototype-staking-poc" />}
                  >
                    <FlaskIcon />
                    {translate("tenant.lifecycle")}
                  </Button>
                )}
              </>
            }
          />
        )}
      </div>
    );
  }

  const busy = proposeMutation.isPending || verifying || computing;
  const proposeBlockReason = !editable
    ? !canManage
      ? translate("nodeConfig.ownerPermission")
      : translate("nodeConfig.communityStatusNamed", {
          status: presentationLabel(tenant.status, translate),
        })
    : !parsedDraft.success
      ? (parsedDraft.error.issues[0]?.message ?? translate("nodeConfig.fixFormSentence"))
      : !hasSigningWallet
        ? daoOwned
          ? translate("nodeConfig.connectAccount", { account: tenantAccount })
          : translate("nodeConfig.connectPublish")
        : null;
  const canPropose = editable && parsedDraft.success && hasSigningWallet && !busy;
  const bundleOpen = showBundle || !!draft.uiProduction || !!draft.ssrUrl;
  const allowed = [
    tenant.allowUiOverrides ? translate("nodeConfig.customUi") : null,
    tenant.allowSsr ? translate("nodeConfig.serverRendering") : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionHeader
          title={translate("tenant.publishedConfig")}
          sectionTestId="orgs-node-config-state"
          action={
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/tenant/$tenantId" params={{ tenantId: tenant.id }} />}
              data-testid="orgs-node-config-settings"
            >
              <GearSixIcon />
              {translate("tenant.settings")}
            </Button>
          }
        />
        <div className="flex flex-col">
          <InfoRow
            label={translate("common.status")}
            value={
              <span
                className="inline-flex flex-wrap items-center justify-end gap-2"
                data-testid="orgs-node-config-config"
              >
                {configPublished ? (
                  <Badge variant="success">{translate("things.live")}</Badge>
                ) : pendingConfigProposal ? (
                  <Badge variant="warning">
                    {translate("lifecycle.awaitingProposal", {
                      proposal: pendingConfigProposal.id,
                    })}
                  </Badge>
                ) : (
                  <Badge variant="outline">{translate("tenant.notPublished")}</Badge>
                )}
                {fastKvUrl && (
                  <a
                    href={fastKvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    FastKV
                  </a>
                )}
              </span>
            }
          />
          <InfoRow
            label={translate("common.address")}
            value={
              tenantUrl && configPublished ? (
                <a
                  href={tenantUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 underline underline-offset-2"
                  data-testid="orgs-node-config-open-tenant"
                >
                  <span className="min-w-0 break-all">{tenantUrl.replace(/^https?:\/\//, "")}</span>
                  <ArrowSquareOutIcon className="size-3.5 shrink-0" />
                </a>
              ) : (
                (hostname ?? translate("nodeConfig.notBound"))
              )
            }
            mono
          />
          <InfoRow
            label={translate("common.owner")}
            value={translate(daoOwned ? "nodeConfig.daoVotes" : "common.platform")}
          />
          <InfoRow label={translate("common.account")} value={tenantAccount} mono />
          {pendingConfigProposal && (
            <InfoRow
              label={translate("tenant.pendingProposal")}
              value={
                pendingThreshold.required == null
                  ? translate("nodeConfig.pendingApprovalsNamed", {
                      id: pendingConfigProposal.id,
                      count: pendingThreshold.approved,
                    })
                  : translate("nodeConfig.pendingThresholdNamed", {
                      id: pendingConfigProposal.id,
                      approved: pendingThreshold.approved,
                      required: pendingThreshold.required,
                    })
              }
            />
          )}
          <InfoRow
            label={translate("common.allowed")}
            value={
              allowed.length > 0
                ? allowed
                    .map((value) =>
                      value === "ui"
                        ? translate("nodeConfig.customUi")
                        : value === "ssr"
                          ? translate("nodeConfig.serverRendering")
                          : value,
                    )
                    .join(" · ")
                : translate("nodeConfig.metadataOnly")
            }
          />
        </div>
      </section>

      {daoOwned && <ConnectDao purpose="community-settings" />}

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("tenant.customize")}
          sectionTestId="orgs-node-config-editor"
          description={
            daoOwned ? translate("tenant.daoChangesHint") : translate("tenant.immediateChangesHint")
          }
        />

        {!editable && (
          <p className="text-sm text-muted-foreground" data-testid="orgs-node-config-locked">
            {proposeBlockReason}
          </p>
        )}

        <FieldGroup className="max-w-2xl">
          <ConfigField
            id="orgs-node-config-title"
            label={translate("common.title")}
            value={draft.title}
            onChange={(value) => setDraft((prev) => ({ ...prev, title: value }))}
            disabled={!editable}
          />
          <ConfigField
            id="orgs-node-config-description"
            label={translate("common.description")}
            value={draft.description}
            onChange={(value) => setDraft((prev) => ({ ...prev, description: value }))}
            disabled={!editable}
          />
          <ConfigField
            id="orgs-node-config-repository"
            label={translate("about.repository")}
            value={draft.repository}
            onChange={(value) => setDraft((prev) => ({ ...prev, repository: value }))}
            placeholder="https://github.com/…"
            mono
            disabled={!editable}
          />
        </FieldGroup>

        {tenant.allowUiOverrides && (
          <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setShowBundle((open) => !open)}
                aria-expanded={bundleOpen}
                data-testid="orgs-node-config-bundle-toggle"
              >
                {bundleOpen ? <CaretDownIcon /> : <CaretRightIcon />}
                {translate("tenant.customBundle")}
              </Button>
              <InfoPopover
                title={translate("tenant.customBundle")}
                body={translate("tenant.integrityDescription")}
              />
            </div>
            {bundleOpen && (
              <FieldGroup>
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="orgs-node-config-source-account">
                    {translate("tenant.fillDeployed")}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="orgs-node-config-source-account"
                      type="text"
                      value={sourceAccount}
                      placeholder={translate("tenant.accountExample")}
                      onChange={(event) => setSourceAccount(event.target.value)}
                      disabled={!editable}
                      className="font-mono"
                      data-testid="orgs-node-config-source-account"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onFillFromDeployedApp()}
                      disabled={!editable || fetchingSource}
                      data-testid="orgs-node-config-autofill"
                    >
                      {fetchingSource ? <Spinner /> : null}
                      {translate("tenant.fetchBundle")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{translate("tenant.fetchHint")}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <ConfigField
                    id="orgs-node-config-ui-url"
                    label={translate("tenant.uiUrl")}
                    value={draft.uiProduction}
                    onChange={(value) => setDraft((prev) => ({ ...prev, uiProduction: value }))}
                    onBlur={() =>
                      setDraft((prev) => ({
                        ...prev,
                        uiProduction: normalizeBundleBaseUrl(prev.uiProduction),
                      }))
                    }
                    placeholder="https://example.com/bundles/<account>/<gateway>/plugin/"
                    mono
                    disabled={!editable}
                  />
                  <Button
                    type="button"
                    onClick={() => void onVerifyUiBundle()}
                    disabled={!editable || computing || !draft.uiProduction}
                    variant="link"
                    size="xs"
                    className="self-start"
                    data-testid="orgs-node-config-verify"
                  >
                    {computing ? translate("tenant.hashing") : translate("tenant.verifyIntegrity")}
                  </Button>
                </div>
                <ConfigField
                  id="orgs-node-config-ui-integrity"
                  label={translate("tenant.uiIntegrity")}
                  value={draft.uiIntegrity}
                  onChange={(value) => setDraft((prev) => ({ ...prev, uiIntegrity: value }))}
                  placeholder="sha384-…"
                  mono
                  disabled={!editable}
                />
                {tenant.allowSsr && (
                  <>
                    <div className="flex flex-col gap-1">
                      <ConfigField
                        id="orgs-node-config-ssr-url"
                        label={translate("tenant.ssrUrl")}
                        value={draft.ssrUrl}
                        onChange={(value) => setDraft((prev) => ({ ...prev, ssrUrl: value }))}
                        onBlur={() =>
                          setDraft((prev) => ({
                            ...prev,
                            ssrUrl: normalizeBundleBaseUrl(prev.ssrUrl),
                          }))
                        }
                        placeholder="https://example.com/bundles/<account>/<gateway>/plugin/"
                        mono
                        disabled={!editable}
                      />
                      <Button
                        type="button"
                        onClick={() => void onVerifySsrBundle()}
                        disabled={!editable || computing || !draft.ssrUrl}
                        variant="link"
                        size="xs"
                        className="self-start"
                        data-testid="orgs-node-config-verify-ssr"
                      >
                        {computing
                          ? translate("tenant.hashing")
                          : translate("tenant.verifyIntegrity")}
                      </Button>
                    </div>
                    <ConfigField
                      id="orgs-node-config-ssr-integrity"
                      label={translate("tenant.ssrIntegrity")}
                      value={draft.ssrIntegrity}
                      onChange={(value) => setDraft((prev) => ({ ...prev, ssrIntegrity: value }))}
                      placeholder="sha384-…"
                      mono
                      disabled={!editable}
                    />
                  </>
                )}
              </FieldGroup>
            )}
          </div>
        )}

        {diff.length > 0 && (
          <div className="flex max-w-2xl flex-col gap-2" data-testid="orgs-node-config-diff">
            <p className="text-sm font-medium text-foreground">
              {translate("nodeConfig.changes", { count: diff.length })}
            </p>
            {diff.map((entry) => (
              <p key={entry.field} className="truncate font-mono text-xs text-muted-foreground">
                {entry.field}: {entry.from || "—"} →{" "}
                <span className="text-foreground">{entry.to || "—"}</span>
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void onPropose()}
            disabled={!canPropose}
            title={proposeBlockReason ?? undefined}
            data-testid="orgs-node-config-propose"
          >
            {busy ? <Spinner /> : <ShieldCheckIcon />}
            {daoOwned ? translate("tenant.proposeChanges") : translate("tenant.publishChanges")}
          </Button>
          {editable && proposeBlockReason && (
            <span className="text-sm text-muted-foreground">{proposeBlockReason}</span>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={unverified !== null}
        onOpenChange={(open) => !open && setUnverified(null)}
        title={
          daoOwned ? translate("tenant.proposeUnverified") : translate("tenant.publishUnverified")
        }
        description={
          unverified ? translate("nodeConfig.bundleUnverified", { bundle: unverified }) : ""
        }
        confirmLabel={
          daoOwned ? translate("nodeConfig.proposeAnyway") : translate("nodeConfig.publishAnyway")
        }
        onConfirm={() => {
          setUnverified(null);
          proposeMutation.mutate();
        }}
      />
    </div>
  );
}

function ConfigField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
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
        onBlur={onBlur}
        className={mono ? "font-mono" : undefined}
        data-testid={id}
      />
    </Field>
  );
}

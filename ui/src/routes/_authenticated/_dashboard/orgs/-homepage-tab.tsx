import { ArrowSquareOutIcon, HouseIcon, StackIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildDraftFromResolvedConfig,
  buildTenantUrl,
  createTenantConfigDraftSchema,
  diffDraft,
  draftUiOverride,
  emptyTenantConfigDraft,
  type TenantConfigDraft,
  useApiClient,
  useAuthClient,
} from "@/app";
import { Badge, Button, ConfirmDialog, EmptyState, InfoRow, SectionHeader } from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { canAccountPropose, trezuDaoUrl } from "@/lib/sputnik-proposals";
import { proposeTenantConfigAsMember, publishTenantConfigForMode } from "@/lib/tenant-deploy";
import { useNearAccount } from "@/lib/use-near-account";
import { ConfigField } from "./-config-field";
import { CustomUiBundleFields } from "./-custom-ui-bundle-fields";
import { runIntegrityPreflight } from "./-integrity-preflight";
import { useOrgTenantConfig } from "./-use-org-tenant-config";
import { usePendingConfigProposal } from "./-use-pending-config-proposal";

export interface HomepageTabProps {
  orgId: string;
  gatewayId: string;
  baseAccount: string;
  canManage: boolean;
  isActive: boolean;
}

export function HomepageTab({
  orgId,
  gatewayId,
  baseAccount,
  canManage,
  isActive,
}: HomepageTabProps) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const nearAccountId = useNearAccount();
  const activeNetwork = auth.useActiveNetwork();

  const {
    tenant,
    daoOwned,
    tenantAccount,
    hostname,
    registryQuery,
    resolvedConfig,
    configPublished,
  } = useOrgTenantConfig(orgId, gatewayId);

  const {
    proposal: pendingProposal,
    threshold,
    policy,
  } = usePendingConfigProposal(tenantAccount, daoOwned);

  const [draft, setDraft] = useState<TenantConfigDraft>(emptyTenantConfigDraft);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (edited || !tenant || !registryQuery.isSuccess) return;
    setDraft(buildDraftFromResolvedConfig(resolvedConfig, { title: tenant.name }));
  }, [edited, tenant, registryQuery.isSuccess, resolvedConfig]);
  const editDraft: Dispatch<SetStateAction<TenantConfigDraft>> = (update) => {
    setEdited(true);
    setDraft(update);
  };

  const draftSchema = createTenantConfigDraftSchema({
    url: translate("nodeConfig.urlInvalid"),
    integrity: translate("nodeConfig.integrityInvalid"),
    manifest: translate("bundle.manifestInvalid"),
    title: translate("nodeConfig.titleRequired"),
    description: translate("nodeConfig.descriptionRequired"),
    uiPair: translate("bundle.uiPairRequired"),
    integrityMode: translate("bundle.integrityMode"),
    pinPair: translate("bundle.pinPair"),
    ssrPair: translate("nodeConfig.ssrPairRequired"),
  });
  const parsedDraft = draftSchema.safeParse(draft);
  const diff = useMemo(() => diffDraft(draft, resolvedConfig), [draft, resolvedConfig]);

  const [verifying, setVerifying] = useState(false);
  const [computing, setComputing] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);

  const tenantUrl = hostname ? buildTenantUrl(hostname, gatewayId) : null;
  const editable = canManage && tenant?.status === "active";
  const hasSigningWallet =
    nearAccountId === tenantAccount &&
    activeNetwork === (tenantAccount.endsWith(".testnet") ? "testnet" : "mainnet");

  const proposeMutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant not loaded");
      if (!gatewayId) throw new Error(translate("tenant.noGateway"));
      if (!hostname) throw new Error("No primary domain binding configured for this tenant");
      const value = draftSchema.parse(draft);
      const app = draftUiOverride(value);
      const common = {
        gatewayId,
        baseAccount,
        hostname,
        title: value.title,
        description: value.description,
        ...(value.repository ? { repository: value.repository } : {}),
        ...(app ? { app } : {}),
      };
      if (daoOwned) {
        return proposeTenantConfigAsMember(apiClient, auth.near, {
          daoAccountId: tenant.accountId,
          ...common,
        });
      }
      if (value.title !== tenant.name) {
        await apiClient.updateTenant({ tenantId: tenant.id, name: value.title });
      }
      return publishTenantConfigForMode(apiClient, auth, {
        accountId: tenant.accountId,
        ...common,
        mode: "platform",
      });
    },
    onSuccess: async () => {
      toast.success(daoOwned ? translate("homepage.proposed") : translate("homepage.published"));
      await invalidateTenantQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["node-config"] });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const onPropose = async () => {
    if (!parsedDraft.success) {
      toast.error(parsedDraft.error.issues[0]?.message ?? translate("nodeConfig.fixForm"));
      return;
    }
    setVerifying(true);
    let preflight: Awaited<ReturnType<typeof runIntegrityPreflight>>;
    try {
      preflight = await runIntegrityPreflight(parsedDraft.data, translate);
    } finally {
      setVerifying(false);
    }
    if (preflight.status === "mismatch") {
      toast.error(preflight.message);
      return;
    }
    if (preflight.status === "unverified") {
      setUnverified(preflight.message);
      return;
    }
    proposeMutation.mutate();
  };

  if (!tenant || !gatewayId) {
    return (
      <div data-testid="orgs-homepage-empty">
        <EmptyState
          icon={StackIcon}
          title={gatewayId ? translate("tenant.noCommunity") : translate("tenant.noGateway")}
          description={
            gatewayId ? translate("homepage.startHint") : translate("homepage.noGateway")
          }
        />
      </div>
    );
  }

  const busy = proposeMutation.isPending || verifying || computing;
  const blockReason = !canManage
    ? translate("homepage.ownerPermission")
    : !isActive
      ? translate("homepage.activate")
      : tenant.status !== "active"
        ? translate("nodeConfig.communityStatusNamed", {
            status: presentationLabel(tenant.status, translate),
          })
        : !parsedDraft.success
          ? (parsedDraft.error.issues[0]?.message ?? translate("nodeConfig.fixFormSentence"))
          : daoOwned && !nearAccountId
            ? translate("homepage.connect")
            : daoOwned && activeNetwork !== "mainnet"
              ? translate("homepage.mainnet")
              : daoOwned && policy && !canAccountPropose(policy, nearAccountId)
                ? translate("homepage.permission", {
                    account: nearAccountId ?? "",
                    dao: tenantAccount,
                  })
                : !daoOwned && !hasSigningWallet
                  ? translate("nodeConfig.connectPublish")
                  : null;
  const canPropose = blockReason === null && !busy;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionHeader title={translate("homepage.title")} sectionTestId="orgs-homepage-state" />
        <div className="flex flex-col">
          <InfoRow
            label={translate("common.status")}
            value={
              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                {pendingProposal ? (
                  <Badge variant="warning" data-testid="orgs-homepage-pending">
                    {translate("lifecycle.awaitingProposal", { proposal: pendingProposal.id })}
                  </Badge>
                ) : configPublished ? (
                  <Badge variant="success">{translate("common.live")}</Badge>
                ) : (
                  <Badge variant="outline">{translate("tenant.notPublished")}</Badge>
                )}
              </span>
            }
          />
          {pendingProposal && (
            <>
              <InfoRow
                label={translate("lifecycle.approvals")}
                value={
                  <span data-testid="orgs-homepage-threshold">
                    {threshold.required == null
                      ? translate("homepage.approvals", { approved: threshold.approved })
                      : translate("homepage.approvalThreshold", {
                          approved: threshold.approved,
                          required: threshold.required,
                        })}
                  </span>
                }
              />
              <InfoRow
                label={translate("lifecycle.vote")}
                value={
                  <a
                    href={trezuDaoUrl(tenantAccount)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                    data-testid="orgs-homepage-trezu-link"
                  >
                    {translate("homepage.voteTrezu")}
                    <ArrowSquareOutIcon className="size-3.5 shrink-0" />
                  </a>
                }
              />
            </>
          )}
          {tenantUrl && configPublished && (
            <InfoRow
              label={translate("common.address")}
              value={
                <Link to="/tenant/$tenantId" params={{ tenantId: tenant.id }}>
                  {tenantUrl.replace(/^https?:\/\//, "")}
                </Link>
              }
              mono
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("homepage.propose")}
          description={
            daoOwned ? translate("tenant.daoChangesHint") : translate("tenant.immediateChangesHint")
          }
        />

        <FieldGroup className="max-w-2xl">
          <ConfigField
            id="orgs-homepage-title"
            label={translate("common.title")}
            value={draft.title}
            onChange={(value) => editDraft((prev) => ({ ...prev, title: value }))}
            disabled={!editable}
          />
          <ConfigField
            id="orgs-homepage-description"
            label={translate("common.description")}
            value={draft.description}
            onChange={(value) => editDraft((prev) => ({ ...prev, description: value }))}
            disabled={!editable}
          />
        </FieldGroup>

        {tenant.allowUiOverrides ? (
          <div className="flex max-w-2xl flex-col gap-4">
            <CustomUiBundleFields
              idPrefix="orgs-homepage"
              draft={draft}
              setDraft={editDraft}
              allowSsr={tenant.allowSsr}
              disabled={!editable}
              gatewayId={gatewayId}
              onComputingChange={setComputing}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="orgs-homepage-ui-disabled">
            {translate("homepage.customDisabled")}
          </p>
        )}

        {diff.length > 0 && (
          <div className="flex max-w-2xl flex-col gap-2" data-testid="orgs-homepage-diff">
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
            title={blockReason ?? undefined}
            data-testid="orgs-homepage-propose"
          >
            {busy ? <Spinner /> : <HouseIcon />}
            {daoOwned ? translate("homepage.proposeAction") : translate("homepage.publishAction")}
          </Button>
          {blockReason && (
            <span
              className="text-sm text-muted-foreground"
              data-testid="orgs-homepage-block-reason"
            >
              {blockReason}
            </span>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={unverified !== null}
        onOpenChange={(open) => !open && setUnverified(null)}
        title={
          daoOwned ? translate("tenant.proposeUnverified") : translate("tenant.publishUnverified")
        }
        description={unverified ?? ""}
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

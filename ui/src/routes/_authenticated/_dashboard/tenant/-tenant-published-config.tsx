import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
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
import { Badge, Button, ConfirmDialog, InfoPopover, InfoRow, SectionHeader } from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { describeDaoError, useDaoConnection } from "@/lib/dao-connect";
import { presentationLabel } from "@/lib/presentation-label";
import { invalidateTenantQueries } from "@/lib/queries/tenants";
import { canAccountPropose, trezuDaoUrl, waitFor } from "@/lib/sputnik-proposals";
import {
  networkForAccount,
  proposeTenantConfigAsMember,
  publishTenantConfigForMode,
  type TenantConfigPublishMode,
} from "@/lib/tenant-deploy";
import { useNearAccount } from "@/lib/use-near-account";
import { ConfigField } from "./-config-field";
import { CustomUiBundleFields } from "./-custom-ui-bundle-fields";
import { runIntegrityPreflight } from "./-integrity-preflight";
import { PUBLISHED_CONFIG_SECTION_ID } from "./-published-config-section";
import type { TenantRecord } from "./-tenant-types";
import { usePendingConfigProposal } from "./-use-pending-config-proposal";
import { usePublishedConfig } from "./-use-published-config";

type PublishPath = TenantConfigPublishMode | "member";

export function TenantPublishedConfig({
  tenant,
  hostname,
  gatewayId,
  baseAccount,
  activation,
}: {
  tenant: TenantRecord;
  hostname: string | null;
  gatewayId: string;
  baseAccount: string;
  activation: { isPending: boolean; onActivate: () => void } | null;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const connection = useDaoConnection();
  const nearAccountId = useNearAccount();
  const activeNetwork = auth.useActiveNetwork();
  const sectionRef = useRef<HTMLElement>(null);
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (hash === PUBLISHED_CONFIG_SECTION_ID) sectionRef.current?.scrollIntoView();
  }, [hash]);

  const tenantAccount = tenant.accountId;
  const daoOwned = tenant.ownerKind === "dao";
  const { registryQuery, resolvedConfig, configPublished, fetchPublishedNow } = usePublishedConfig(
    tenantAccount,
    gatewayId,
  );
  const {
    proposal: pendingProposal,
    threshold,
    policy,
  } = usePendingConfigProposal(tenantAccount, daoOwned);

  const [draft, setDraft] = useState<TenantConfigDraft>(emptyTenantConfigDraft);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (edited || !registryQuery.isSuccess) return;
    setDraft(buildDraftFromResolvedConfig(resolvedConfig, { title: tenant.name }));
  }, [edited, tenant.name, registryQuery.isSuccess, resolvedConfig]);
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
  const [showBundle, setShowBundle] = useState(false);

  const tenantUrl = hostname ? buildTenantUrl(hostname, gatewayId) : null;
  const editable = tenant.status === "active";
  const daoConnected =
    connection.status === "connected" && connection.daoAccountId === tenantAccount;
  const path: PublishPath = daoOwned ? (daoConnected ? "dao" : "member") : "platform";
  const ownsWallet =
    nearAccountId === tenantAccount && activeNetwork === networkForAccount(tenantAccount);

  const configMatchesDraft = (resolved: Record<string, unknown> | null | undefined) =>
    !!resolved &&
    resolved.title === draft.title.trim() &&
    (!draft.uiProduction ||
      ((resolved.app as { ui?: { production?: string } } | undefined)?.ui?.production ?? "") ===
        draft.uiProduction.trim());

  const proposeMutation = useMutation({
    mutationFn: async () => {
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
      if (path === "member") {
        return proposeTenantConfigAsMember(apiClient, auth.near, {
          daoAccountId: tenantAccount,
          ...common,
        });
      }
      if (value.title !== tenant.name) {
        await apiClient.updateTenant({ tenantId: tenant.id, name: value.title });
      }
      return publishTenantConfigForMode(apiClient, auth, {
        accountId: tenantAccount,
        ...common,
        mode: path === "dao" ? "dao" : "platform",
      });
    },
    onSuccess: async () => {
      if (path === "dao") {
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
        toast.success(
          path === "member"
            ? translate("tenant.proposalSubmitted")
            : translate("tenant.configPublished"),
        );
      }
      setEdited(false);
      await invalidateTenantQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["node-config"] });
    },
    onError: (error: Error) =>
      toast.error(
        path === "dao"
          ? describeDaoError(error, tenantAccount, translate)
          : appErrorMessage(error, translate),
      ),
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

  const busy = proposeMutation.isPending || verifying || computing;
  const blockReason =
    tenant.status !== "active"
      ? translate("nodeConfig.communityStatusNamed", {
          status: presentationLabel(tenant.status, translate),
        })
      : activation
        ? translate("tenant.activateToPublish")
        : !parsedDraft.success
          ? (parsedDraft.error.issues[0]?.message ?? translate("nodeConfig.fixFormSentence"))
          : path === "member" && !nearAccountId
            ? translate("nodeConfig.connectAccount", { account: tenantAccount })
            : path === "member" && activeNetwork !== "mainnet"
              ? translate("homepage.mainnet")
              : path === "member" && policy && !canAccountPropose(policy, nearAccountId)
                ? translate("homepage.permission", {
                    account: nearAccountId ?? "",
                    dao: tenantAccount,
                  })
                : path === "platform" && !ownsWallet
                  ? translate("nodeConfig.connectPublish")
                  : null;
  const canPropose = blockReason === null && !busy;
  const bundleOpen = showBundle || !!draft.uiProduction || !!draft.ssrUrl;

  return (
    <section
      id={PUBLISHED_CONFIG_SECTION_ID}
      ref={sectionRef}
      className="flex scroll-mt-20 flex-col gap-6"
    >
      <SectionHeader
        title={translate("tenant.customize")}
        description={
          daoOwned ? translate("tenant.daoChangesHint") : translate("tenant.immediateChangesHint")
        }
        sectionTestId="tenant.section.published-config"
      />

      <div className="flex flex-col">
        <InfoRow
          label={translate("common.status")}
          value={
            <span
              className="inline-flex flex-wrap items-center justify-end gap-2"
              data-testid="tenant-published-config-status"
            >
              {pendingProposal ? (
                <Badge variant="warning" data-testid="tenant-published-config-pending">
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
                <span data-testid="tenant-published-config-threshold">
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
                  data-testid="tenant-published-config-trezu-link"
                >
                  {translate("homepage.voteTrezu")}
                  <ArrowSquareOutIcon className="size-3.5 shrink-0" />
                </a>
              }
            />
          </>
        )}
      </div>

      <FieldGroup className="max-w-2xl">
        <ConfigField
          id="tenant-published-config-title"
          label={translate("common.title")}
          value={draft.title}
          onChange={(value) => editDraft((prev) => ({ ...prev, title: value }))}
          disabled={!editable}
        />
        <ConfigField
          id="tenant-published-config-description"
          label={translate("common.description")}
          value={draft.description}
          onChange={(value) => editDraft((prev) => ({ ...prev, description: value }))}
          disabled={!editable}
        />
        <ConfigField
          id="tenant-published-config-repository"
          label={translate("about.repository")}
          value={draft.repository}
          onChange={(value) => editDraft((prev) => ({ ...prev, repository: value }))}
          placeholder="https://github.com/…"
          mono
          disabled={!editable}
        />
      </FieldGroup>

      {tenant.allowUiOverrides ? (
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowBundle((open) => !open)}
              aria-expanded={bundleOpen}
              data-testid="tenant-published-config-bundle-toggle"
            >
              {bundleOpen ? <CaretDownIcon /> : <CaretRightIcon />}
              {translate("tenant.customBundle")}
            </Button>
            <InfoPopover
              title={translate("tenant.customBundle")}
              body={translate("tenant.integrityDescription")}
            />
          </div>
          <CustomUiBundleFields
            idPrefix="tenant-published-config"
            draft={draft}
            setDraft={editDraft}
            allowSsr={tenant.allowSsr}
            disabled={!editable}
            gatewayId={gatewayId}
            collapsed={!bundleOpen}
            onComputingChange={setComputing}
          />
        </div>
      ) : (
        <p
          className="text-sm text-muted-foreground"
          data-testid="tenant-published-config-ui-disabled"
        >
          {translate("homepage.customDisabled")}
        </p>
      )}

      {diff.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-2" data-testid="tenant-published-config-diff">
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
          data-testid="tenant-published-config-propose"
        >
          {busy ? <Spinner /> : <ShieldCheckIcon />}
          {daoOwned ? translate("tenant.proposeChanges") : translate("tenant.publishChanges")}
        </Button>
        {blockReason && (
          <span
            className="text-sm text-muted-foreground"
            data-testid="tenant-published-config-block-reason"
          >
            {blockReason}
          </span>
        )}
        {activation && tenant.status === "active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={activation.onActivate}
            disabled={activation.isPending}
            data-testid="tenant-published-config-activate"
          >
            {activation.isPending ? <Spinner /> : null}
            {translate(activation.isPending ? "org.switching" : "org.makeActive")}
          </Button>
        )}
      </div>

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
    </section>
  );
}

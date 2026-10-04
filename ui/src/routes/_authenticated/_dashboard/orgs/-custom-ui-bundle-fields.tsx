import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import {
  computeSsrEntryIntegrity,
  computeSubresourceIntegrity,
  computeUiEntryIntegrity,
  normalizeBundleBaseUrl,
  type TenantConfigDraft,
  useApiClient,
} from "@/app";
import { Button, FieldLabel, Input } from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { ConfigField } from "./-config-field";

export interface CustomUiBundleFieldsProps {
  idPrefix: string;
  draft: TenantConfigDraft;
  setDraft: Dispatch<SetStateAction<TenantConfigDraft>>;
  allowSsr: boolean;
  disabled: boolean;
  gatewayId: string;
  collapsed?: boolean;
  onComputingChange?: (computing: boolean) => void;
}

export function CustomUiBundleFields({
  idPrefix,
  draft,
  setDraft,
  allowSsr,
  disabled,
  gatewayId,
  collapsed = false,
  onComputingChange,
}: CustomUiBundleFieldsProps) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const [computing, setComputingState] = useState(false);
  const [sourceAccount, setSourceAccount] = useState("");
  const [fetchingSource, setFetchingSource] = useState(false);

  const setComputing = (value: boolean) => {
    setComputingState(value);
    onComputingChange?.(value);
  };

  const onFillFromDeployedApp = async () => {
    const account = sourceAccount.trim();
    if (!account) {
      toast.error(translate("tenant.deployedAccountRequired"));
      return;
    }
    setFetchingSource(true);
    try {
      const result = await apiClient.registry.getRegistryApp({ accountId: account, gatewayId });
      const resolved = result.data?.resolvedConfig ?? null;
      const ui =
        (
          resolved?.app as {
            ui?: {
              production?: unknown;
              integrity?: unknown;
              pin?: { manifest?: unknown; integrity?: unknown };
            };
          } | null
        )?.ui ?? {};
      const production = typeof ui.production === "string" ? ui.production : "";
      const integrity = typeof ui.integrity === "string" ? ui.integrity : "";
      const pinManifest = typeof ui.pin?.manifest === "string" ? ui.pin.manifest : "";
      const pinIntegrity = typeof ui.pin?.integrity === "string" ? ui.pin.integrity : "";
      if (!production || (!integrity && !(pinManifest && pinIntegrity))) {
        toast.error(translate("tenant.noCustomBundle", { account }));
        return;
      }
      const ssr =
        (resolved?.app as { ui?: { ssr?: unknown; ssrIntegrity?: unknown } } | null)?.ui ?? {};
      const ssrUrl = typeof ssr.ssr === "string" ? ssr.ssr : "";
      const ssrIntegrity = typeof ssr.ssrIntegrity === "string" ? ssr.ssrIntegrity : "";
      setDraft((prev) => ({
        ...prev,
        uiProduction: production,
        uiIntegrity: pinManifest ? "" : integrity,
        uiManifest: pinManifest,
        uiPinIntegrity: pinIntegrity,
        ...(allowSsr && ssrUrl && ssrIntegrity ? { ssrUrl, ssrIntegrity } : {}),
      }));
      toast.success(translate("tenant.bundleFilled", { account }));
    } catch {
      toast.error(translate("tenant.noPublishedConfig", { account }));
    } finally {
      setFetchingSource(false);
    }
  };

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
        toast.success(translate("tenant.integrityFilled", { label }));
        return;
      }
      if (computed === currentIntegrity) {
        toast.success(translate("tenant.integrityMatches", { label }));
      } else {
        toast.error(translate("tenant.integrityMismatch", { label, hash: computed }));
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
    if (draft.uiManifest) {
      if (!draft.uiPinIntegrity) {
        toast.error(translate("bundle.pinRequired"));
      }
      return onVerifyBundle(
        draft.uiManifest,
        draft.uiPinIntegrity,
        (manifestName) =>
          computeSubresourceIntegrity(
            `${draft.uiProduction.replace(/\/$/, "")}/${manifestName.replace(/^\//, "")}`,
          ),
        (computed) => setDraft((prev) => ({ ...prev, uiPinIntegrity: computed })),
        translate("bundle.pin"),
      );
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

  if (collapsed) return null;

  return (
    <FieldGroup>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${idPrefix}-source-account`}>
          {translate("tenant.fillDeployed")}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-source-account`}
            type="text"
            value={sourceAccount}
            placeholder={translate("tenant.accountExample")}
            onChange={(event) => setSourceAccount(event.target.value)}
            disabled={disabled}
            className="font-mono"
            data-testid={`${idPrefix}-source-account`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void onFillFromDeployedApp()}
            disabled={disabled || fetchingSource}
            data-testid={`${idPrefix}-autofill`}
          >
            {fetchingSource ? <Spinner /> : null}
            {translate("tenant.fetchBundle")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{translate("tenant.fetchHint")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <ConfigField
          id={`${idPrefix}-ui-url`}
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
          disabled={disabled}
        />
        <Button
          type="button"
          onClick={() => void onVerifyUiBundle()}
          disabled={disabled || computing || !draft.uiProduction}
          variant="link"
          size="xs"
          className="self-start"
          data-testid={`${idPrefix}-verify`}
        >
          {computing ? translate("tenant.hashing") : translate("tenant.verifyIntegrity")}
        </Button>
      </div>
      <ConfigField
        id={`${idPrefix}-ui-integrity`}
        label={translate("bundle.directIntegrity")}
        value={draft.uiIntegrity}
        onChange={(value) =>
          setDraft((prev) => ({
            ...prev,
            uiIntegrity: value,
            ...(value ? { uiManifest: "", uiPinIntegrity: "" } : {}),
          }))
        }
        placeholder="sha384-…"
        mono
        disabled={disabled}
      />
      <ConfigField
        id={`${idPrefix}-ui-pin-manifest`}
        label={translate("bundle.manifest")}
        value={draft.uiManifest}
        onChange={(value) =>
          setDraft((prev) => ({
            ...prev,
            uiManifest: value,
            ...(value ? { uiIntegrity: "" } : {}),
          }))
        }
        onBlur={() =>
          setDraft((prev) => ({
            ...prev,
            uiManifest: prev.uiManifest.trim().replace(/^\//, ""),
          }))
        }
        placeholder="versions/<version-id>.json"
        mono
        disabled={disabled}
      />
      {draft.uiManifest && (
        <ConfigField
          id={`${idPrefix}-ui-pin-integrity`}
          label={translate("bundle.pinIntegrity")}
          value={draft.uiPinIntegrity}
          onChange={(value) => setDraft((prev) => ({ ...prev, uiPinIntegrity: value }))}
          placeholder="sha384-…"
          mono
          disabled={disabled}
        />
      )}
      {allowSsr && (
        <>
          <div className="flex flex-col gap-1">
            <ConfigField
              id={`${idPrefix}-ssr-url`}
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
              disabled={disabled}
            />
            <Button
              type="button"
              onClick={() => void onVerifySsrBundle()}
              disabled={disabled || computing || !draft.ssrUrl}
              variant="link"
              size="xs"
              className="self-start"
              data-testid={`${idPrefix}-verify-ssr`}
            >
              {computing ? translate("tenant.hashing") : translate("tenant.verifyIntegrity")}
            </Button>
          </div>
          <ConfigField
            id={`${idPrefix}-ssr-integrity`}
            label={translate("tenant.ssrIntegrity")}
            value={draft.ssrIntegrity}
            onChange={(value) => setDraft((prev) => ({ ...prev, ssrIntegrity: value }))}
            placeholder="sha384-…"
            mono
            disabled={disabled}
          />
        </>
      )}
    </FieldGroup>
  );
}

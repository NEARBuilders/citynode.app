import {
  type IntegrityCheckResult,
  type TenantConfigDraft,
  verifySsrIntegrity,
  verifyUiIntegrity,
  verifyUiPin,
} from "@/app";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

export type IntegrityPreflight =
  | { status: "ok" }
  | { status: "mismatch"; message: string }
  | { status: "unverified"; message: string };

export async function runIntegrityPreflight(
  value: TenantConfigDraft,
  translate: AppTranslator = translateEnglishAppMessage,
): Promise<IntegrityPreflight> {
  const checks: { label: string; check: IntegrityCheckResult }[] = [];
  if (value.uiProduction && value.uiManifest && value.uiPinIntegrity) {
    checks.push({
      label: translate("bundle.pin"),
      check: await verifyUiPin(value.uiProduction, {
        manifest: value.uiManifest,
        integrity: value.uiPinIntegrity,
      }),
    });
  } else if (value.uiProduction && value.uiIntegrity) {
    checks.push({
      label: "UI",
      check: await verifyUiIntegrity(value.uiProduction, value.uiIntegrity),
    });
  }
  if (value.ssrUrl && value.ssrIntegrity) {
    checks.push({
      label: "SSR",
      check: await verifySsrIntegrity(value.ssrUrl, value.ssrIntegrity),
    });
  }
  for (const { label, check } of checks) {
    if (check.status === "mismatch") {
      return {
        status: "mismatch",
        message: translate("tenant.integrityMismatch", { label, hash: check.computed }),
      };
    }
    if (check.status === "unverified") {
      return {
        status: "unverified",
        message: translate("nodeConfig.bundleUnverified", { bundle: label }),
      };
    }
  }
  return { status: "ok" };
}

import QRCode from "qrcode";
import { type ApiClient, getActiveRuntime, getRuntimeConfig } from "@/app";
import { useClientValue } from "@/hooks";
import { getGatewayOrigin } from "./gateway-origin";

export type OnboardingLink = Awaited<ReturnType<ApiClient["listOnboardingLinks"]>>[number];

export const onboardingLinksQueryKey = (orgId: string) => ["onboarding-links", orgId] as const;

export function onboardingLinksQueryOptions(apiClient: ApiClient, orgId: string) {
  return {
    queryKey: onboardingLinksQueryKey(orgId),
    queryFn: () => apiClient.listOnboardingLinks({ organizationId: orgId }),
  };
}

export function useGatewayOrigin(): string | null {
  return useClientValue<string | null>(
    () => getGatewayOrigin(getActiveRuntime(getRuntimeConfig())?.gatewayId),
    null,
  );
}

export function qrFileName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "link"}-qr.png`;
}

export async function downloadQr(url: string, name: string) {
  const dataUrl = await QRCode.toDataURL(url, { width: 1200, margin: 2 });
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = qrFileName(name);
  anchor.click();
}

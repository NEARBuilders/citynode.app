import { Badge } from "@/components";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage, useAppTranslation } from "@/i18n/runtime";
import type { RelayerInfoData } from "@/lib/use-relayer";
import { RelayerStatusBody } from "./-relayer-status-body";

export function relayerStatus(
  info: RelayerInfoData | null | undefined,
  t: AppTranslator = translateEnglishAppMessage,
) {
  if (!info) return { label: t("common.notConfigured"), variant: "outline" as const };
  if (info.enabled) return { label: t("common.active"), variant: "success" as const };
  if (info.accountId) return { label: t("admin.relayer.funding"), variant: "destructive" as const };
  return { label: t("common.starting"), variant: "warning" as const };
}

export function RelayerStatus({
  info,
  isLoading,
}: {
  info: RelayerInfoData | null | undefined;
  isLoading: boolean;
}) {
  const translate = useAppTranslation();
  const status = relayerStatus(info, translate);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-xl font-semibold text-foreground">{translate("common.status")}</h2>
        {!isLoading && (
          <Badge variant={status.variant} data-testid="admin-relayer-status">
            {status.label}
          </Badge>
        )}
        {info?.mode && (
          <Badge variant="outline" className="font-mono">
            {info.mode}
          </Badge>
        )}
      </div>
      <RelayerStatusBody info={info} isLoading={isLoading} />
    </section>
  );
}

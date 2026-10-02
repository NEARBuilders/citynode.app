import { CopyIcon } from "@phosphor-icons/react";
import { Trans } from "everything-dev/ui/i18n";
import { toast } from "sonner";
import { Button } from "@/components";
import { InfoRow } from "@/components/info-row";
import { translateAppMessage, useAppLocale, useAppTranslation } from "@/i18n/runtime";
import type { RelayerInfoData } from "@/lib/use-relayer";
import { formatNearFigure, StatFigure, StatGrid } from "./-admin-ui";

async function copyAccount(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(translateAppMessage("admin.relayerCopied"));
  } catch {
    toast.error(translateAppMessage("admin.relayer.copyFailed"));
  }
}

export function RelayerStatusBody({
  info,
  isLoading,
}: {
  info: RelayerInfoData | null | undefined;
  isLoading: boolean;
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{translate("admin.relayer.loading")}</p>;
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans
          id="admin.relayerNotConfigured"
          components={{
            variable: <code className="font-mono" />,
            config: <code className="font-mono" />,
          }}
        />
      </p>
    );
  }

  if (!info.enabled) {
    return (
      <div className="flex flex-col gap-3">
        {info.accountId ? (
          <>
            <p className="text-base text-foreground">{translate("admin.relayer.sendHint")}</p>
            <div className="flex items-center gap-2">
              <p className="min-w-0 font-mono text-sm break-all text-foreground">
                {info.accountId}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate("admin.relayer.copy")}
                onClick={() => void copyAccount(info.accountId ?? "")}
                data-testid="admin-relayer-copy-account"
              >
                <CopyIcon />
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{translate("admin.relayer.restartHint")}</p>
        )}
        {info.error && (
          <p role="alert" className="text-sm text-destructive">
            {translate("admin.relayer.serverUnconfigured")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <StatGrid>
        <StatFigure
          label={translate("common.balance")}
          value={formatNearFigure(info.balance, locale)}
          hint="NEAR"
          testId="admin-relayer-balance"
        />
        <StatFigure
          label={translate("common.available")}
          value={formatNearFigure(info.available, locale)}
          hint="NEAR"
          testId="admin-relayer-available"
        />
      </StatGrid>
      <div className="flex flex-col">
        <InfoRow label={translate("common.account")} value={info.accountId} mono />
        <InfoRow label={translate("common.network")} value={info.network} mono />
        <InfoRow label={translate("common.publicKey")} value={info.publicKey} mono />
      </div>
    </div>
  );
}

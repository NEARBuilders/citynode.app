import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import type { ReactNode } from "react";
import { Button, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { useDaoConnection } from "@/lib/dao-connect";
import { useNearAccount } from "@/lib/use-near-account";
import { SettingsRow } from "./-settings-row";
import type { TenantAction, TenantRecord } from "./-tenant-types";

export function TenantLiveSite({
  tenant,
  gatewayId,
  hostname,
  republish,
  children,
}: {
  tenant: TenantRecord;
  gatewayId: string;
  hostname: string | null;
  republish: TenantAction;
  children?: ReactNode;
}) {
  const translate = useAppTranslation();
  const isDaoOwned = tenant.ownerKind === "dao";
  const daoConnection = useDaoConnection();
  const nearAccountId = useNearAccount();
  const hasSigningWallet = isDaoOwned
    ? daoConnection.status === "connected" && daoConnection.daoAccountId === tenant.accountId
    : !!nearAccountId;
  const blockedReason = !hostname
    ? translate("tenant.republishAddress")
    : !hasSigningWallet
      ? isDaoOwned
        ? translate("tenant.republishDao")
        : translate("tenant.republishWallet")
      : null;
  const bosUrl = `bos://${tenant.accountId}/${gatewayId}`;
  const fastKvUrl = buildRegistryConfigUrl(tenant.accountId, gatewayId);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title={translate("tenant.publishing")}
        sectionTestId="tenant.section.publishing"
      />
      <div className="flex flex-col">
        <SettingsRow
          label={translate("tenant.publishedConfig")}
          description={blockedReason ?? translate("tenant.republishDescription")}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => republish.mutate()}
              disabled={republish.isPending || !!blockedReason}
              data-testid="tenant.republish"
            >
              {republish.isPending ? "Republishing…" : "Republish"}
            </Button>
          }
        >
          <a
            href={fastKvUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono break-all underline-offset-2 hover:underline"
          >
            {bosUrl}
            <ArrowSquareOutIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        </SettingsRow>
        {children}
      </div>
    </section>
  );
}

import { buildTenantUrl } from "everything-dev/ui/tenant";
import { ExternalLink } from "lucide-react";
import { Button, Card, SectionHeader } from "@/components";
import { useDaoConnection } from "@/lib/dao-connect";
import { useNearAccount } from "@/lib/use-near-account";
import type { TenantAction, TenantRecord } from "./-tenant-types";

export function TenantLiveSite({
  tenant,
  gatewayId,
  hostname,
  republish,
}: {
  tenant: TenantRecord;
  gatewayId: string;
  hostname: string | null;
  republish: TenantAction;
}) {
  const isDaoOwned = tenant.ownerKind === "dao";
  const publishMode = isDaoOwned ? "dao" : "platform";
  const daoConnection = useDaoConnection();
  const nearAccountId = useNearAccount();
  const hasSigningWallet =
    publishMode === "dao"
      ? daoConnection.status === "connected" && daoConnection.daoAccountId === tenant.accountId
      : !!nearAccountId;
  const republishTooltip = !hostname
    ? "create a domain binding before republishing"
    : !hasSigningWallet
      ? isDaoOwned
        ? "connect the DAO account via Trezu to republish"
        : "connect your NEAR session wallet to republish"
      : undefined;

  const canRepublish = !!hostname && hasSigningWallet;

  return (
    <section className="space-y-3">
      <SectionHeader title="Live site" />
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Your tenant is served at the binding hostname below. The site resolves through the parent
          gateway's host.
        </p>
        {hostname && (
          <Button asChild variant="outline" size="sm">
            <a
              href={buildTenantUrl(hostname, gatewayId ?? "") ?? `https://${hostname}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              open {hostname}
            </a>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => republish.mutate()}
          disabled={republish.isPending || !canRepublish}
          title={republishTooltip}
        >
          republish config
        </Button>
        {!canRepublish && <p className="text-xs text-muted-foreground">{republishTooltip}</p>}
      </Card>
    </section>
  );
}

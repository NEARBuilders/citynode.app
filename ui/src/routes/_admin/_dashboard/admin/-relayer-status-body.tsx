import { InfoRow } from "@/components/info-row";
import type { RelayerInfoData } from "@/lib/use-relayer";
import { formatNearFigure, StatFigure, StatGrid } from "./-admin-ui";

export function RelayerStatusBody({
  info,
  isLoading,
}: {
  info: RelayerInfoData | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading relayer…</p>;
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        No relayer configured. Add{" "}
        <code className="font-mono">app.auth.variables.siwn.relayer</code> to{" "}
        <code className="font-mono">bos.config.json</code> and publish.
      </p>
    );
  }

  if (!info.enabled) {
    return (
      <div className="flex flex-col gap-3">
        {info.accountId ? (
          <>
            <p className="text-base">Send NEAR to this account to turn on gasless writes.</p>
            <p className="font-mono text-sm break-all">{info.accountId}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Restart the auth service to finish generating the relayer key.
          </p>
        )}
        {info.error && (
          <p role="alert" className="text-sm text-destructive">
            {info.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <StatGrid>
        <StatFigure
          label="Balance"
          value={formatNearFigure(info.balance)}
          hint="NEAR"
          testId="admin-relayer-balance"
        />
        <StatFigure
          label="Available"
          value={formatNearFigure(info.available)}
          hint="NEAR"
          testId="admin-relayer-available"
        />
      </StatGrid>
      <div className="flex flex-col">
        <InfoRow label="Account" value={info.accountId} mono />
        <InfoRow label="Network" value={info.network} mono />
        <InfoRow label="Public key" value={info.publicKey} mono />
      </div>
    </div>
  );
}

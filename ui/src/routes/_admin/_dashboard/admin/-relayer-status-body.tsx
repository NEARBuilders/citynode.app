import { InfoRow } from "@/components/ui/info-row";
import type { RelayerInfoData } from "@/lib/use-relayer";

export function RelayerStatusBody({
  info,
  isLoading,
}: {
  info: RelayerInfoData | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading relayer info…</p>;
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        No relayer configured. Update <code className="font-mono">bos.config.json</code> with{" "}
        <code className="font-mono">app.auth.variables.siwn.relayer</code> and run{" "}
        <code className="font-mono">bos publish</code> to enable.
      </p>
    );
  }

  if (!info.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        {info.accountId ? (
          <>
            Relayer keypair generated but the account has zero balance. Fund{" "}
            <span className="font-mono text-foreground">{info.accountId}</span> with NEAR to
            activate gasless relay.
          </>
        ) : (
          "Restart the auth service to complete ephemeral keypair generation."
        )}
        {info.error && <span className="block mt-2 text-destructive">error: {info.error}</span>}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <InfoRow label="account" value={info.accountId} mono />
      <InfoRow label="balance" value={`${info.balance} NEAR`} mono />
      <InfoRow label="available" value={`${info.available} NEAR`} mono />
      <InfoRow label="network" value={info.network} mono />
      <InfoRow label="public key" value={info.publicKey} mono />
    </div>
  );
}

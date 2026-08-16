import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Fuel, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Badge, Button, Card, CardContent, Field, FieldLabel, Input } from "@/components";
import { InfoRow } from "@/components/ui/info-row";
import {
  formatYocto,
  relayerInfoQueryKey,
  useRelayerFund,
  useRelayerInfoQuery,
} from "@/lib/use-relayer-fund";

export const Route = createFileRoute("/_layout/_admin/admin/relayer")({
  head: () => ({
    meta: [{ title: "Relayer | app" }],
  }),
  component: AdminRelayerPage,
});

const FUND_PRESETS = ["1", "5", "10"] as const;

function AdminRelayerPage() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const nearAccountId = auth.near.getAccountId();

  const relayerInfoQuery = useRelayerInfoQuery();
  const info = relayerInfoQuery.data;

  const fund = useRelayerFund(info, {
    onSuccess: () => {
      relayerInfoQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["relay-history"] });
    },
  });

  const relayHistoryQuery = useQuery({
    queryKey: ["relay-history"],
    queryFn: async () => {
      const { data } = await auth.near.relayHistory();
      return data ?? null;
    },
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: relayerInfoQueryKey });
    queryClient.invalidateQueries({ queryKey: ["relay-history"] });
  };

  const handleConnect = async () => {
    const connected = await auth.near.ensureConnected();
    if (connected) {
      toast.success("Wallet connected");
      refresh();
    } else {
      toast.error("Wallet connection declined");
    }
  };

  const history = relayHistoryQuery.data;

  const statusLabel = !info
    ? "not configured"
    : info.enabled
      ? "active"
      : info.accountId
        ? "needs funding"
        : "initialising";

  const statusVariant =
    !info || info.enabled ? "default" : info.accountId ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Relayer</h1>
          <p className="text-sm text-muted-foreground">
            Gasless NEP-366 delegate action relay for tenant config + app metadata writes.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Status</h2>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              {info?.mode && (
                <Badge variant="outline" className="font-mono">
                  {info.mode}
                </Badge>
              )}
            </div>
          </div>

          {relayerInfoQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading relayer info…</p>
          ) : !info ? (
            <p className="text-sm text-muted-foreground">
              No relayer configured. Update <code className="font-mono">bos.config.json</code> with{" "}
              <code className="font-mono">app.auth.variables.siwn.relayer</code> and run{" "}
              <code className="font-mono">bos publish</code> to enable.
            </p>
          ) : !info.enabled ? (
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
            </p>
          ) : (
            <div className="space-y-1">
              <InfoRow label="account" value={info.accountId} mono />
              <InfoRow label="balance" value={formatYocto(info.balance) ?? "—"} mono />
              <InfoRow label="network" value={info.network ?? "—"} mono />
              <InfoRow label="available" value={formatYocto(info.available) ?? "—"} mono />
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={relayerInfoQuery.isFetching}
          >
            refresh
          </Button>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Top up</h2>
          </div>

          {!nearAccountId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect a NEAR wallet to fund the relayer.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleConnect}>
                <Wallet className="h-3.5 w-3.5" />
                connect wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Sending from <span className="font-mono">{nearAccountId}</span>
              </p>
              <Field>
                <FieldLabel htmlFor="fund-amount">amount (NEAR)</FieldLabel>
                <Input
                  id="fund-amount"
                  type="number"
                  min="0"
                  step="0.1"
                  value={fund.amount}
                  onChange={(e) => fund.setAmount(e.target.value)}
                  disabled={fund.sending}
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {FUND_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fund.setAmount(preset)}
                    disabled={fund.sending}
                  >
                    {preset} NEAR
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={fund.sendFund}
                disabled={fund.sending || fund.parsedAmount === null}
              >
                <Coins className="h-3.5 w-3.5" />
                {fund.sending ? "sending…" : "fund relayer"}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent relays</h2>
          {relayHistoryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !history?.transactions?.length ? (
            <p className="text-sm text-muted-foreground">
              No relayed transactions yet. Tenant republish + app metadata writes will appear here.
            </p>
          ) : (
            <ul className="space-y-2 text-xs font-mono">
              {history.transactions.slice(0, 8).map((tx) => (
                <li
                  key={tx.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1 last:border-b-0"
                >
                  <span>{tx.txHash.slice(0, 12)}…</span>
                  <span className="text-muted-foreground">{tx.senderId}</span>
                  <Badge
                    variant={
                      tx.status === "completed"
                        ? "default"
                        : tx.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {tx.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

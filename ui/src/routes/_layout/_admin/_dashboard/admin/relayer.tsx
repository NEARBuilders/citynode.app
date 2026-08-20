import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Fuel, Wallet } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Badge, Button, Card, CardContent, Field, FieldLabel, Input } from "@/components";
import { InfoRow } from "@/components/ui/info-row";
import { relayerInfoQueryKey, useRelayerInfoQuery } from "@/lib/use-relayer";

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/relayer")({
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

  const [amount, setAmount] = useState("5");
  const [sending, setSending] = useState(false);

  const parsedAmount = useMemo(() => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) return null;
    return value;
  }, [amount]);

  const sendFund = useCallback(async () => {
    const target = info?.accountId;
    if (!target) {
      toast.error("Relayer not configured on the server.");
      return;
    }
    if (parsedAmount === null) {
      toast.error("Enter a valid amount in NEAR.");
      return;
    }
    const connected = await auth.near.ensureConnected();
    if (!connected) {
      toast.error("Connect a NEAR wallet first");
      return;
    }
    const signer = auth.near.getAccountId();
    if (!signer) {
      toast.error("Connect a NEAR wallet first");
      return;
    }
    setSending(true);
    try {
      const result = await auth.near
        .getNearClient()
        .transaction(signer)
        .transfer(target, `${parsedAmount} NEAR`)
        .send({ waitUntil: "FINAL" });
      toast.success("Relayer funded", {
        description: result.transaction?.hash
          ? `tx: ${result.transaction.hash}`
          : `Sent ${parsedAmount} NEAR → ${target}`,
      });
      relayerInfoQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["relay-history"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Funding failed");
    } finally {
      setSending(false);
    }
  }, [auth, info?.accountId, parsedAmount, queryClient, relayerInfoQuery]);

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
              {info.error && (
                <span className="block mt-2 text-destructive">error: {info.error}</span>
              )}
            </p>
          ) : (
            <div className="space-y-1">
              <InfoRow label="account" value={info.accountId} mono />
              <InfoRow label="balance" value={`${info.balance} NEAR`} mono />
              <InfoRow label="available" value={`${info.available} NEAR`} mono />
              <InfoRow label="network" value={info.network} mono />
              <InfoRow label="public key" value={info.publicKey} mono />
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={sending}
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {FUND_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(preset)}
                    disabled={sending}
                  >
                    {preset} NEAR
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={sendFund}
                disabled={sending || parsedAmount === null}
              >
                <Coins className="h-3.5 w-3.5" />
                {sending ? "sending…" : "fund relayer"}
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

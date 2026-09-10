import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Amount } from "near-kit";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Card } from "@/components";
import { parseNearAmount } from "@/lib/near-amount";
import { useNearAccount } from "@/lib/use-near-account";
import { relayerInfoQueryKey, useRelayerInfoQuery } from "@/lib/use-relayer";
import { RelayerHistory } from "./-relayer-history";
import { RelayerStatus } from "./-relayer-status";
import { RelayerTopUp } from "./-relayer-top-up";

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/relayer")({
  head: () => ({
    meta: [{ title: "Relayer | app" }],
  }),
  component: AdminRelayerPage,
});

function AdminRelayerPage() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const nearAccountId = useNearAccount();

  const relayerInfoQuery = useRelayerInfoQuery();
  const info = relayerInfoQuery.data;

  const [amount, setAmount] = useState("5");
  const [sending, setSending] = useState(false);

  const parsedAmount = useMemo(() => parseNearAmount(amount), [amount]);

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
        .transfer(target, Amount.yocto(parsedAmount))
        .send({ waitUntil: "FINAL" });
      toast.success("Relayer funded", {
        description: result.transaction?.hash
          ? `tx: ${result.transaction.hash}`
          : `Sent ${amount} NEAR → ${target}`,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-4">
          <RelayerStatus
            info={info}
            isLoading={relayerInfoQuery.isLoading}
            isFetching={relayerInfoQuery.isFetching}
            onRefresh={refresh}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RelayerTopUp
            nearAccountId={nearAccountId}
            amount={amount}
            sending={sending}
            parsedAmount={parsedAmount}
            onAmountChange={setAmount}
            onPreset={setAmount}
            onConnect={handleConnect}
            onFund={sendFund}
          />
        </Card>
      </div>

      <Card>
        <RelayerHistory history={relayHistoryQuery.data} isLoading={relayHistoryQuery.isLoading} />
      </Card>
    </div>
  );
}

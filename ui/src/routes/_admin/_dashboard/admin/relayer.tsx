import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Amount } from "near-kit";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Button, PageHeader } from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { parseNearAmount } from "@/lib/near-amount";
import { pageTitle } from "@/lib/page-title";
import { useNearAccount } from "@/lib/use-near-account";
import { relayerInfoQueryKey, useRelayerInfoQuery } from "@/lib/use-relayer";
import { RelayerHistory } from "./-relayer-history";
import { RelayerStatus } from "./-relayer-status";
import { RelayerTopUp } from "./-relayer-top-up";

export const Route = createFileRoute("/_admin/_dashboard/admin/relayer")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.relayerAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminRelayerPage,
});

function AdminRelayerPage() {
  const translate = useAppTranslation();
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
      toast.error(translate("admin.relayer.serverUnconfigured"));
      return;
    }
    if (parsedAmount === null) {
      toast.error(translate("admin.relayer.invalidAmount"));
      return;
    }
    const connected = await auth.near.ensureConnected();
    if (!connected) {
      toast.error(translate("wallet.connectFirst"));
      return;
    }
    const signer = auth.near.getAccountId();
    if (!signer) {
      toast.error(translate("wallet.connectFirst"));
      return;
    }
    setSending(true);
    try {
      const result = await auth.near
        .getNearClient()
        .transaction(signer)
        .transfer(target, Amount.yocto(parsedAmount))
        .send({ waitUntil: "FINAL" });
      toast.success(translate("admin.relayer.funded"), {
        description: result.transaction?.hash
          ? translate("admin.relayer.txNamed", { hash: result.transaction.hash })
          : translate("admin.relayer.sentNamed", { amount, account: target }),
      });
      relayerInfoQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["relay-history"] });
    } catch (err) {
      toast.error(appErrorMessage(err, translate));
    } finally {
      setSending(false);
    }
  }, [auth, info?.accountId, parsedAmount, queryClient, relayerInfoQuery, amount, translate]);

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
      toast.success(translate("admin.walletConnected"));
      refresh();
    } else {
      toast.error(translate("admin.walletDeclined"));
    }
  };

  return (
    <>
      <PageHeader
        title={translate("nav.relayer")}
        description={translate("admin.relayer.paysGas")}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={translate("common.refresh")}
            onClick={refresh}
            disabled={relayerInfoQuery.isFetching}
            data-testid="admin-relayer-refresh"
          >
            <ArrowClockwiseIcon />
          </Button>
        }
        headerTestId="admin-relayer.heading"
      />

      <RelayerStatus info={info} isLoading={relayerInfoQuery.isLoading} />

      {info?.accountId && (
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
      )}

      <RelayerHistory history={relayHistoryQuery.data} isLoading={relayHistoryQuery.isLoading} />
    </>
  );
}

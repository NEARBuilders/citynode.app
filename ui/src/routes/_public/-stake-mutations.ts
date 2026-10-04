import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import { AppActionError, appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { invalidateStakePoolQueries } from "@/lib/queries/stake-pool";

const STAKE_GAS = "300000000000000";

export type StakeVariables = {
  amount: bigint;
  network: string;
  poolAccountId: string;
  protocol: string;
};

export function useStakeWalletConnection(auth: AuthClient) {
  const translate = useAppTranslation();
  const [isConnecting, setIsConnecting] = useState(false);
  const connect = async () => {
    setIsConnecting(true);
    try {
      const connected = await auth.near.ensureConnected();
      if (!connected) toast.error(translate("wallet.connectFailed"));
    } catch {
      toast.error(translate("wallet.connectFailed"));
    } finally {
      setIsConnecting(false);
    }
  };

  return { connect, isConnecting };
}

export function useStakeMutation(auth: AuthClient, queryClient: QueryClient) {
  const translate = useAppTranslation();
  return useMutation({
    mutationFn: async ({
      amount: stakeAmount,
      network,
      poolAccountId,
      protocol,
    }: StakeVariables) => {
      if (protocol !== "near") {
        throw new AppActionError("stake.unsupportedProtocol");
      }
      if (stakeAmount <= 0n) {
        throw new AppActionError("stake.positiveAmount");
      }
      const connected = await auth.near.ensureConnected();
      if (!connected) throw new AppActionError("stake.connectRequired");
      if (auth.near.getNetwork() !== network) {
        throw new AppActionError("stake.switchNetwork", { network });
      }
      const signer = auth.near.getAccountId();
      if (!signer) throw new AppActionError("stake.connectRequired");
      const near = auth.near.getNearClient();
      const result = await near
        .transaction(signer)
        .functionCall(
          poolAccountId,
          "deposit_and_stake",
          {},
          { gas: STAKE_GAS, attachedDeposit: stakeAmount },
        )
        .send({ waitUntil: "FINAL" });
      return { network, poolAccountId, result };
    },
    onSuccess: async ({ network, poolAccountId, result }) => {
      toast.success(translate("stake.success"), {
        description: result.transaction?.hash ? `tx: ${result.transaction.hash}` : undefined,
      });
      try {
        await invalidateStakePoolQueries(queryClient, poolAccountId, network);
      } catch {
        toast.warning(translate("stake.refreshFailed"));
      }
    },
    onError: (err: Error) => toast.error(appErrorMessage(err, translate)),
  });
}

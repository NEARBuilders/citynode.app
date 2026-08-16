import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AuthClient } from "./auth";
import { useAuthClient } from "./auth";

export interface RelayerInfoData {
  accountId?: string;
  mode?: "ephemeral" | "explicit";
  enabled?: boolean;
  balance?: string;
  available?: string;
  network?: "mainnet" | "testnet";
}

export interface RelayerInfoResult {
  data: RelayerInfoData | null;
  refetch: () => Promise<unknown>;
}

export const relayerInfoQueryKey = ["relayer-info"] as const;

export function useRelayerInfoQuery(
  auth: AuthClient = useAuthClient(),
): UseQueryResult<RelayerInfoData | null> {
  return useQuery({
    queryKey: relayerInfoQueryKey,
    queryFn: async () => {
      const { data } = await auth.near.getRelayerInfo();
      return (data ?? null) as RelayerInfoData | null;
    },
    refetchInterval: 30_000,
  });
}

export function useRelayerFund(
  info: RelayerInfoData | null | undefined,
  options?: { onSuccess?: () => void },
) {
  const auth = useAuthClient();
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
      options?.onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Funding failed");
    } finally {
      setSending(false);
    }
  }, [auth, info?.accountId, parsedAmount, options]);

  return {
    amount,
    setAmount,
    sending,
    parsedAmount,
    sendFund,
  };
}

export function formatYocto(value: string | bigint | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    const v = typeof value === "string" ? BigInt(value) : BigInt(value);
    if (v === 0n) return "0 NEAR";
    const whole = v / 10n ** 24n;
    const frac = v % 10n ** 24n;
    const fracStr = frac.toString().padStart(24, "0").slice(0, 4);
    return fracStr === "0000" ? `${whole} NEAR` : `${whole}.${fracStr} NEAR`;
  } catch {
    return null;
  }
}

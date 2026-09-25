import { useQuery } from "@tanstack/react-query";
import { formatAmount } from "near-kit";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { useSessionGasKey } from "@/lib/use-gas-key";
import { Button } from "./button";

export function EnableGaslessWrites({ nearAccountId }: { nearAccountId: string | null }) {
  const auth = useAuthClient();
  const { state } = useSessionGasKey();
  const [enabling, setEnabling] = useState(false);

  const scopeQuery = useQuery({
    queryKey: ["gas-key-scope"],
    queryFn: async () => {
      const { data } = await auth.near.getGasKeyScope();
      return data ?? { enabled: false };
    },
    staleTime: 60_000,
    retry: false,
  });

  const walletSupportedQuery = useQuery({
    queryKey: ["gas-key-wallet-supported", nearAccountId],
    queryFn: () => auth.near.isGasKeyWalletSupported(),
    staleTime: 60_000,
    retry: false,
  });

  if (!scopeQuery.data?.enabled) return null;

  if (state) {
    return (
      <p data-testid="gasless-writes-status" className="text-xs text-muted-foreground">
        Gasless writes enabled
        {state.balance && /^\d+$/.test(state.balance)
          ? ` — session gas key balance ${formatAmount(BigInt(state.balance), { precision: 4, trimZeros: true })}`
          : ""}
        .
      </p>
    );
  }

  if (!nearAccountId) return null;

  const walletSupported = walletSupportedQuery.data;
  if (walletSupported === undefined) return null;

  if (!walletSupported) {
    return (
      <p data-testid="gasless-writes-unsupported" className="text-xs text-muted-foreground">
        Your connected wallet doesn&apos;t support gas keys. Gasless writes need a wallet with
        gas-key support (e.g. Meteor); publishing falls back to the relayer.
      </p>
    );
  }

  const enable = async () => {
    setEnabling(true);
    try {
      await auth.near.addSessionGasKey({
        onError: (error) => toast.error(error.message || "Failed to enable gasless writes"),
      });
      const funded = await auth.near.ensureGasKeyFunded();
      if (funded) {
        toast.success("Gasless writes enabled");
      } else {
        toast.warning(
          "Session gas key not funded yet — publishing falls back to the relayer until it is funded.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to enable gasless writes");
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        data-testid="enable-gasless-writes"
        variant="secondary"
        size="sm"
        onClick={() => void enable()}
        disabled={enabling}
      >
        {enabling ? "Enabling..." : "Enable gasless writes"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Adds a session gas key to your account scoped to platform writes; the platform funds its
        gas.
      </p>
    </div>
  );
}

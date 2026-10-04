import { useQuery } from "@tanstack/react-query";
import { formatAmount } from "near-kit";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Switch } from "@/components/ui/switch";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { useSessionGasKey } from "@/lib/use-gas-key";

export function EnableGaslessWrites({ nearAccountId }: { nearAccountId: string | null }) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
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
    const balance =
      state.balance && /^\d+$/.test(state.balance)
        ? new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(
            Number(formatAmount(BigInt(state.balance), { precision: 4, trimZeros: true })),
          )
        : null;
    return (
      <GaslessRow
        description={
          <span data-testid="gasless-writes-status">
            {balance ? translate("gasless.onWithBalance", { balance }) : translate("common.on")}
          </span>
        }
      >
        <Switch checked disabled aria-label={translate("gasless.title")} />
      </GaslessRow>
    );
  }

  if (!nearAccountId) return null;

  const walletSupported = walletSupportedQuery.data;
  if (walletSupported === undefined) return null;

  if (!walletSupported) {
    return (
      <GaslessRow
        description={
          <span data-testid="gasless-writes-unsupported">{translate("gasless.unsupported")}</span>
        }
      >
        <Switch checked={false} disabled aria-label={translate("gasless.title")} />
      </GaslessRow>
    );
  }

  const enable = async () => {
    setEnabling(true);
    try {
      await auth.near.addSessionGasKey({
        onError: (error) => toast.error(appErrorMessage(error, translate)),
      });
      const funded = await auth.near.ensureGasKeyFunded();
      if (funded) {
        toast.success(translate("gasless.enabled"));
      } else {
        toast.warning(translate("gasless.unfunded"));
      }
    } catch (error) {
      toast.error(appErrorMessage(error, translate));
    } finally {
      setEnabling(false);
    }
  };

  return (
    <GaslessRow
      description={enabling ? translate("gasless.approve") : translate("gasless.description")}
    >
      <Switch
        checked={enabling}
        disabled={enabling}
        onCheckedChange={(checked) => {
          if (checked) void enable();
        }}
        aria-label={translate("gasless.enable")}
        data-testid="enable-gasless-writes"
      />
    </GaslessRow>
  );
}

function GaslessRow({ description, children }: { description: ReactNode; children: ReactNode }) {
  const translate = useAppTranslation();
  return (
    <div
      className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-b-0"
      data-testid="gasless-writes-row"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{translate("gasless.title")}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      {children}
    </div>
  );
}

import { CoinsIcon, GasPumpIcon, WalletIcon } from "@phosphor-icons/react";
import { Button, Field, FieldLabel, Input } from "@/components";

export function RelayerTopUp({
  nearAccountId,
  amount,
  sending,
  parsedAmount,
  onAmountChange,
  onPreset,
  onConnect,
  onFund,
}: {
  nearAccountId: string | null;
  amount: string;
  sending: boolean;
  parsedAmount: bigint | null;
  onAmountChange: (value: string) => void;
  onPreset: (value: string) => void;
  onConnect: () => void;
  onFund: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GasPumpIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Top up</h2>
      </div>

      {!nearAccountId ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect a NEAR wallet to fund the relayer.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onConnect}>
            <WalletIcon className="h-3.5 w-3.5" />
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
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={sending}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {["1", "5", "10"].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPreset(preset)}
                disabled={sending}
              >
                {preset} NEAR
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onFund}
            disabled={sending || parsedAmount === null}
          >
            <CoinsIcon className="h-3.5 w-3.5" />
            {sending ? "sending…" : "fund relayer"}
          </Button>
        </div>
      )}
    </div>
  );
}

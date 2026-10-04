import { WalletIcon } from "@phosphor-icons/react";
import { Button, Field, FieldLabel, SectionHeader } from "@/components";
import { FieldDescription } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { useAppTranslation } from "@/i18n/runtime";

const PRESETS = ["1", "5", "10"];

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
  const translate = useAppTranslation();
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("admin.relayer.addFunds")} />

      {!nearAccountId ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">{translate("admin.relayer.connectHint")}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onConnect}
            data-testid="admin-relayer-connect"
          >
            <WalletIcon />
            {translate("wallet.connect")}
          </Button>
        </div>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="fund-amount">{translate("common.amount")}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="fund-amount"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                disabled={sending}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>NEAR</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {translate("engagement.from")}
              <span className="font-mono break-all">{nearAccountId}</span>
            </FieldDescription>
          </Field>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={amount === preset ? "secondary" : "outline"}
                size="sm"
                aria-pressed={amount === preset}
                onClick={() => onPreset(preset)}
                disabled={sending}
              >
                {preset} NEAR
              </Button>
            ))}
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto sm:self-start"
            onClick={onFund}
            disabled={sending || parsedAmount === null}
            data-testid="admin-relayer-fund"
          >
            {sending ? translate("common.sending") : translate("admin.relayer.fund")}
          </Button>
        </div>
      )}
    </section>
  );
}

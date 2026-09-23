import { Wallet } from "lucide-react";
import type { useApiClient } from "@/app";
import { Button, Card, Field, FieldLabel, Input } from "@/components";
import type { StakeVariables } from "./-stake-mutations";

type ApiClient = ReturnType<typeof useApiClient>;
type Validator = Awaited<ReturnType<ApiClient["resolveStakingValidators"]>>["validators"][number];

export function StakeForm({
  amount,
  connectingWallet,
  isPending,
  nearAccountId,
  onAmountChange,
  onConnect,
  onStake,
  parsedYocto,
  validator,
}: {
  amount: string;
  connectingWallet: boolean;
  isPending: boolean;
  nearAccountId: string | null;
  onAmountChange: (value: string) => void;
  onConnect: () => void;
  onStake: (variables: StakeVariables) => void;
  parsedYocto: bigint | null;
  validator: Validator | undefined;
}) {
  if (!validator) return null;
  return (
    <Card className="p-6 space-y-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Stake
      </div>
      {!nearAccountId ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No NEAR wallet linked. Connect one to stake.
          </p>
          <Button variant="outline" onClick={onConnect} disabled={connectingWallet}>
            {connectingWallet ? "connecting…" : "connect wallet"}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="font-mono text-xs">{nearAccountId}</span>
          </div>
          <Field>
            <FieldLabel htmlFor="amount-input">Amount (NEAR)</FieldLabel>
            <Input
              id="amount-input"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              className="h-9 text-sm"
            />
          </Field>
          <Button
            onClick={() => {
              if (!parsedYocto) return;
              onStake({
                amount: parsedYocto,
                network: validator.network || "mainnet",
                poolAccountId: validator.accountId,
                protocol: validator.protocol || "near",
              });
            }}
            disabled={validator.protocol !== "near" || !parsedYocto || isPending}
            className="w-full"
          >
            {isPending ? "Staking…" : `Stake ${amount || "0"} NEAR`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Staking sends NEAR to the pool contract — your stake stays under your account.
          </p>
        </>
      )}
    </Card>
  );
}

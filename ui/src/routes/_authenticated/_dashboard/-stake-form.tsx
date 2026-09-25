import { WalletIcon } from "@phosphor-icons/react";
import type { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { StakeVariables } from "./-stake-mutations";

type ApiClient = ReturnType<typeof useApiClient>;
type Validator = Awaited<ReturnType<ApiClient["resolveStakingValidators"]>>["validators"][number];

const QUICK_AMOUNTS = ["1", "10", "100"];

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
  const acceptsNear = validator.protocol === "near";
  return (
    <Card data-testid="stake.form">
      <CardHeader>
        <CardTitle>How much?</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="amount-input" className="sr-only">
            Amount
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="amount-input"
              data-testid="stake.amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>NEAR</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <Button
                key={value}
                type="button"
                size="xs"
                variant={amount === value ? "secondary" : "ghost"}
                onClick={() => onAmountChange(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          {!acceptsNear && (
            <FieldDescription>This pool can&apos;t receive NEAR here.</FieldDescription>
          )}
        </Field>

        {!nearAccountId ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Connect a NEAR wallet to stake.</p>
            <Button
              onClick={onConnect}
              disabled={connectingWallet}
              data-testid="stake.connect-wallet"
            >
              {connectingWallet ? <Spinner /> : <WalletIcon data-icon="inline-start" />}
              {connectingWallet ? "Connecting…" : "Connect wallet"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <Button
              data-testid="stake.submit"
              onClick={() => {
                if (!parsedYocto) return;
                onStake({
                  amount: parsedYocto,
                  network: validator.network || "mainnet",
                  poolAccountId: validator.accountId,
                  protocol: validator.protocol || "near",
                });
              }}
              disabled={!acceptsNear || !parsedYocto || isPending}
            >
              {isPending && <Spinner />}
              {isPending ? "Staking…" : `Stake ${amount || "0"} NEAR`}
            </Button>
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <WalletIcon className="shrink-0" />
              <span className="truncate font-mono">{nearAccountId}</span>
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Your NEAR stays yours. You can unstake anytime; it unlocks after about two days.
        </p>
      </CardContent>
    </Card>
  );
}

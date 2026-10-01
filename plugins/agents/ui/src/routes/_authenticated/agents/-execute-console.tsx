import type { StatusResponse } from "@near-intents-agent-api/contracts/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthClient } from "everything-dev/ui/auth";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  agentHistoryOptions,
  agentKeys,
  agentTokenCatalogOptions,
  useAgentsClient,
  useGrantAgentsClient,
} from "./-agent-queries";
import { storedGrantLabels, storedToken } from "./-intent-signing";
import { StatusBadge } from "./-status-badge";

type TokenOption = { assetId: string; symbol: string | null; decimals: number | null };

function toAtomic(human: string, decimals: number | null): string {
  const trimmed = human.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`Invalid amount: ${human}`);
  }
  const scale = decimals ?? 0;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(scale)).slice(0, scale);
  return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "") || "0";
}

function TokenSelect({
  tokens,
  value,
  onChange,
  placeholder,
  testId,
}: {
  tokens: TokenOption[];
  value: string;
  onChange: (assetId: string) => void;
  placeholder: string;
  testId: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(next: string | null) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger data-testid={testId} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {tokens.map((token) => (
          <SelectItem key={token.assetId} value={token.assetId}>
            {token.symbol ?? token.assetId}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AmountInput({
  amount,
  onAmountChange,
  testId,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  testId: string;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0.0"
      value={amount}
      onChange={(event) => onAmountChange(event.target.value)}
      data-testid={testId}
    />
  );
}

function ExecutionResult({ result }: { result: { status: string; correlationId: string } | null }) {
  if (!result) return null;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      data-testid="agents-execute-result"
    >
      <span className="font-mono text-xs text-muted-foreground">{result.correlationId}</span>
      <StatusBadge status={result.status} />
    </div>
  );
}

function SwapForm({
  agentId,
  tokens,
  grantToken,
  onResult,
}: {
  agentId: string;
  tokens: TokenOption[];
  grantToken: string;
  onResult: (result: { status: string; correlationId: string } | null) => void;
}) {
  const grantClient = useGrantAgentsClient(grantToken);
  const queryClient = useQueryClient();
  const [originAsset, setOriginAsset] = useState("");
  const [destinationAsset, setDestinationAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<string | null>(null);

  const originToken = tokens.find((token) => token.assetId === originAsset);

  const execute = useMutation({
    mutationFn: async ({ dry }: { dry: boolean }) => {
      const atomic = toAtomic(amount, originToken?.decimals ?? null);
      return grantClient.swap({
        agentId,
        originAsset,
        destinationAsset,
        amount: atomic,
        dry,
      });
    },
    onSuccess: (result) => {
      if (result && "dry" in result && result.dry) {
        setQuote(JSON.stringify(result.quote, null, 2));
        return;
      }
      setQuote(null);
      if (result) {
        const status = result as StatusResponse;
        onResult({ status: status.status, correlationId: status.correlationId });
        toast.success(`Swap ${status.status.toLowerCase()}`);
        void queryClient.invalidateQueries({ queryKey: agentKeys.all(agentId) });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>From</FieldLabel>
        <TokenSelect
          tokens={tokens}
          value={originAsset}
          onChange={setOriginAsset}
          placeholder="Origin asset"
          testId="agents-swap-origin"
        />
      </Field>
      <Field>
        <FieldLabel>To</FieldLabel>
        <TokenSelect
          tokens={tokens}
          value={destinationAsset}
          onChange={setDestinationAsset}
          placeholder="Destination asset"
          testId="agents-swap-destination"
        />
      </Field>
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <AmountInput amount={amount} onAmountChange={setAmount} testId="agents-swap-amount" />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!originAsset || !destinationAsset || !amount || execute.isPending}
          onClick={() => execute.mutate({ dry: true })}
          data-testid="agents-swap-quote"
        >
          Quote
        </Button>
        <Button
          type="button"
          disabled={!originAsset || !destinationAsset || !amount || execute.isPending}
          onClick={() => execute.mutate({ dry: false })}
          data-testid="agents-swap-submit"
        >
          Swap
        </Button>
      </div>
      {quote && (
        <pre
          className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs"
          data-testid="agents-swap-quote-output"
        >
          {quote}
        </pre>
      )}
    </div>
  );
}

function WithdrawForm({
  agentId,
  tokens,
  grantToken,
  onResult,
}: {
  agentId: string;
  tokens: TokenOption[];
  grantToken: string;
  onResult: (result: { status: string; correlationId: string } | null) => void;
}) {
  const grantClient = useGrantAgentsClient(grantToken);
  const queryClient = useQueryClient();
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState("near");
  const [recipient, setRecipient] = useState("");
  const assetToken = tokens.find((token) => token.assetId === asset);

  const execute = useMutation({
    mutationFn: async () => {
      const atomic = toAtomic(amount, assetToken?.decimals ?? null);
      return grantClient.withdraw({
        agentId,
        asset,
        amount: atomic,
        chain,
        recipient,
      });
    },
    onSuccess: (result) => {
      if (result) {
        const status = result as StatusResponse;
        onResult({ status: status.status, correlationId: status.correlationId });
        toast.success(`Withdraw ${status.status.toLowerCase()}`);
        void queryClient.invalidateQueries({ queryKey: agentKeys.all(agentId) });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Asset</FieldLabel>
        <TokenSelect
          tokens={tokens}
          value={asset}
          onChange={setAsset}
          placeholder="Asset to withdraw"
          testId="agents-withdraw-asset"
        />
      </Field>
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <AmountInput amount={amount} onAmountChange={setAmount} testId="agents-withdraw-amount" />
      </Field>
      <Field>
        <FieldLabel>Destination chain</FieldLabel>
        <Input
          value={chain}
          onChange={(event) => setChain(event.target.value)}
          data-testid="agents-withdraw-chain"
        />
      </Field>
      <Field>
        <FieldLabel>Recipient address</FieldLabel>
        <Input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient on the destination chain"
          data-testid="agents-withdraw-recipient"
        />
      </Field>
      <Button
        type="button"
        disabled={!asset || !amount || !recipient || execute.isPending}
        onClick={() => execute.mutate()}
        data-testid="agents-withdraw-submit"
      >
        Withdraw
      </Button>
    </div>
  );
}

function DepositForm({
  agentId,
  tokens,
  grantToken,
  onResult,
}: {
  agentId: string;
  tokens: TokenOption[];
  grantToken: string;
  onResult: (result: { status: string; correlationId: string } | null) => void;
}) {
  const grantClient = useGrantAgentsClient(grantToken);
  const queryClient = useQueryClient();
  const [originAsset, setOriginAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const originToken = tokens.find((token) => token.assetId === originAsset);

  const execute = useMutation({
    mutationFn: async () => {
      const atomic = toAtomic(amount, originToken?.decimals ?? null);
      return grantClient.deposit({
        agentId,
        originAsset,
        amount: atomic,
      });
    },
    onSuccess: (result) => {
      if (result) {
        const status = result as StatusResponse;
        const address =
          status.details && "depositAddress" in status.details
            ? status.details.depositAddress
            : null;
        setDepositAddress(typeof address === "string" ? address : null);
        onResult({ status: status.status, correlationId: status.correlationId });
        toast.success("Deposit address ready");
        void queryClient.invalidateQueries({ queryKey: agentKeys.all(agentId) });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Origin asset</FieldLabel>
        <TokenSelect
          tokens={tokens}
          value={originAsset}
          onChange={setOriginAsset}
          placeholder="Asset to deposit"
          testId="agents-deposit-asset"
        />
      </Field>
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <AmountInput amount={amount} onAmountChange={setAmount} testId="agents-deposit-amount" />
      </Field>
      <Button
        type="button"
        disabled={!originAsset || !amount || execute.isPending}
        onClick={() => execute.mutate()}
        data-testid="agents-deposit-submit"
      >
        Get deposit address
      </Button>
      {depositAddress && (
        <p className="font-mono text-xs break-all" data-testid="agents-deposit-address">
          {depositAddress}
        </p>
      )}
    </div>
  );
}

function SignMessageForm({
  agentId,
  grantToken,
  onResult,
}: {
  agentId: string;
  grantToken: string;
  onResult: (result: { status: string; correlationId: string } | null) => void;
}) {
  const grantClient = useGrantAgentsClient(grantToken);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");

  const execute = useMutation({
    mutationFn: async () => {
      return grantClient.signMessage({
        agentId,
        chain: "near",
        message,
        recipient,
      });
    },
    onSuccess: (result) => {
      if (result) {
        const status = result as StatusResponse;
        onResult({ status: status.status, correlationId: status.correlationId });
        toast.success("Message signed");
        void queryClient.invalidateQueries({ queryKey: agentKeys.history(agentId) });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Requires a grant with the sign action and a policy whose sign_message recipients include the
        audience.
      </p>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          data-testid="agents-sign-message"
        />
      </Field>
      <Field>
        <FieldLabel>Recipient (audience)</FieldLabel>
        <Input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="audience.near"
          data-testid="agents-sign-recipient"
        />
      </Field>
      <Button
        type="button"
        disabled={!message || !recipient || execute.isPending}
        onClick={() => execute.mutate()}
        data-testid="agents-sign-submit"
      >
        Sign
      </Button>
    </div>
  );
}

export function ExecuteConsole({ agentId }: { agentId: string }) {
  const apiClient = useAgentsClient();
  const authClient = useAuthClient();
  const [tab, setTab] = useState("swap");
  const [result, setResult] = useState<{ status: string; correlationId: string } | null>(null);

  const tokens = useQuery(agentTokenCatalogOptions(apiClient));
  const history = useQuery(agentHistoryOptions(apiClient, agentId));

  const grantToken = useMemo(() => {
    const labels = storedGrantLabels(agentId);
    return labels.length > 0 ? (storedToken(agentId, labels[0]) ?? "") : "";
  }, [agentId, history.dataUpdatedAt]);

  const walletReady = authClient.near.isWalletConnected();

  if (!walletReady) {
    return (
      <Item>
        <ItemContent>
          <ItemTitle>Wallet not connected</ItemTitle>
          <ItemDescription>
            Connect your NEAR wallet (top-right) to execute intents for this agent.
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  if (!grantToken) {
    return (
      <Item>
        <ItemContent>
          <ItemTitle>No grant credential on this device</ItemTitle>
          <ItemDescription>
            Issue a grant first — the execution console uses its token to act for the agent.
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  const tokenOptions: TokenOption[] = (tokens.data ?? []).map((token) => ({
    assetId: token.assetId,
    symbol: token.symbol,
    decimals: token.decimals,
  }));

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="swap" data-testid="agents-tab-swap">
            Swap
          </TabsTrigger>
          <TabsTrigger value="withdraw" data-testid="agents-tab-withdraw">
            Withdraw
          </TabsTrigger>
          <TabsTrigger value="deposit" data-testid="agents-tab-deposit">
            Deposit
          </TabsTrigger>
          <TabsTrigger value="sign" data-testid="agents-tab-sign">
            Sign message
          </TabsTrigger>
        </TabsList>
        <TabsContent value="swap">
          <SwapForm
            agentId={agentId}
            tokens={tokenOptions}
            grantToken={grantToken}
            onResult={setResult}
          />
        </TabsContent>
        <TabsContent value="withdraw">
          <WithdrawForm
            agentId={agentId}
            tokens={tokenOptions}
            grantToken={grantToken}
            onResult={setResult}
          />
        </TabsContent>
        <TabsContent value="deposit">
          <DepositForm
            agentId={agentId}
            tokens={tokenOptions}
            grantToken={grantToken}
            onResult={setResult}
          />
        </TabsContent>
        <TabsContent value="sign">
          <SignMessageForm agentId={agentId} grantToken={grantToken} onResult={setResult} />
        </TabsContent>
      </Tabs>
      <ExecutionResult result={result} />
    </div>
  );
}

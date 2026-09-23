import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sessionQueryOptions, useAuthClient } from "@/app";
import { Button, Card } from "@/components";
import { pluginPath, pluginSearch } from "@/lib/plugin-path";
import { cn } from "@/lib/utils";

type SearchParams = {
  state: string | undefined;
  port: number | undefined;
  account?: string;
  device?: string;
  expiresIn?: number;
  mode?: string;
  pubKey?: string;
  contract?: string;
  network?: string;
};

export const Route = createFileRoute("/_public/cli")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    state: typeof search.state === "string" ? search.state : undefined,
    port:
      typeof search.port === "string" && /^\d+$/.test(search.port)
        ? Number(search.port)
        : undefined,
    account: typeof search.account === "string" ? search.account : undefined,
    device: typeof search.device === "string" ? search.device : undefined,
    expiresIn:
      typeof search.expiresIn === "string" && /^\d+$/.test(search.expiresIn)
        ? Number(search.expiresIn)
        : undefined,
    mode: typeof search.mode === "string" ? search.mode : undefined,
    pubKey: typeof search.pubKey === "string" ? search.pubKey : undefined,
    contract: typeof search.contract === "string" ? search.contract : undefined,
    network: typeof search.network === "string" ? search.network : undefined,
  }),
  component: CliLoginPage,
});

type NearAccount = {
  id: string;
  accountId: string;
  isPrimary: boolean;
};

type NearAccountsResult = {
  accounts: NearAccount[];
  activeAccount: NearAccount | null;
};

async function postToLoopback(
  port: number,
  payload: Record<string, string | number | null | undefined>,
): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/callback`, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`CLI handoff failed (${res.status})`);
}

function CliLoginPage() {
  const auth = useAuthClient();
  const {
    state,
    port,
    account: configAccount,
    device,
    expiresIn,
    mode,
    pubKey,
    contract,
  } = Route.useSearch();

  const { data: session, isPending: sessionPending } = useQuery(sessionQueryOptions(auth));

  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffComplete, setHandoffComplete] = useState(false);

  useEffect(() => {
    setHandoffError(null);
    setHandoffComplete(false);
  }, [state, port]);

  const nearAccountsQuery = useQuery({
    queryKey: ["near-accounts"],
    queryFn: async (): Promise<NearAccountsResult> => {
      const { data, error } = await auth.near.listAccounts();
      if (error) throw new Error(error.message);
      return data as unknown as NearAccountsResult;
    },
    enabled: !!session?.user,
  });

  const signedInAccountId = nearAccountsQuery.data?.activeAccount?.accountId ?? null;

  const mintMutation = useMutation({
    mutationFn: async () => {
      if (!state || !port) throw new Error("Missing CLI login parameters");
      const { data, error } = await auth.apiKey.create({
        configId: "user-keys",
        name: `bos login — ${device ?? "cli"} — ${new Date().toLocaleString()}`,
        ...(expiresIn ? { expiresIn } : {}),
      });
      if (error) throw new Error(error.message);
      if (!data?.key) throw new Error("API key creation returned no key");
      await postToLoopback(port, {
        state,
        key: data.key,
        keyId: data.id,
        account: signedInAccountId,
      });
      return true;
    },
    onSuccess: () => setHandoffComplete(true),
    onError: (error: Error) => {
      const message = error.message || "Failed to create CLI credential";
      setHandoffError(message);
      toast.error(message);
    },
  });

  const addDelegateKeyMutation = useMutation({
    mutationFn: async () => {
      if (!state || !port || !pubKey || !contract) {
        throw new Error("Missing delegate-key parameters");
      }
      if (!signedInAccountId) throw new Error("Connect a NEAR account first");
      const client = auth.near.getNearClient();
      await client
        .transaction(signedInAccountId!)
        .addKey(pubKey, {
          type: "functionCall",
          receiverId: contract,
          methodNames: ["__fastdata_kv"],
          allowance: "1 NEAR",
        })
        .send();
      await postToLoopback(port, {
        state,
        account: signedInAccountId,
        added: 1,
      });
      return true;
    },
    onSuccess: () => setHandoffComplete(true),
    onError: (error: Error) => {
      const message = error.message || "Failed to add delegate key";
      setHandoffError(message);
      toast.error(message);
    },
  });

  if (handoffComplete) {
    return (
      <Page>
        <Card className="p-6 space-y-2">
          <h1 className="text-lg font-semibold text-foreground" data-testid="cli.heading">
            Connected — return to your terminal
          </h1>
          <p className="text-sm text-muted-foreground">
            The CLI received the credential. You can close this window.
          </p>
        </Card>
      </Page>
    );
  }

  if (handoffError) {
    return (
      <Page>
        <Card className="p-6 space-y-2">
          <h1 className="text-lg font-semibold text-foreground" data-testid="cli.heading">
            CLI login failed
          </h1>
          <p className="text-sm text-muted-foreground">{handoffError}</p>
        </Card>
      </Page>
    );
  }

  if (!state || !port) {
    return (
      <Page>
        <Card className="p-6 space-y-2">
          <h1 className="text-lg font-semibold text-foreground" data-testid="cli.heading">
            CLI login
          </h1>
          <p className="text-sm text-muted-foreground">
            This page is opened by <code className="font-mono">bos login</code>. Run{" "}
            <code className="font-mono">bos login</code> in your project to start the flow.
          </p>
        </Card>
      </Page>
    );
  }

  if (sessionPending) {
    return <Page />;
  }

  const isDelegateMode = mode === "delegate";

  if (!session?.user) {
    const cliParams = new URLSearchParams();
    if (state) cliParams.set("state", state);
    if (port !== undefined) cliParams.set("port", String(port));
    if (isDelegateMode) cliParams.set("mode", "delegate");
    if (pubKey) cliParams.set("pubKey", pubKey);
    if (contract) cliParams.set("contract", contract);
    if (device) cliParams.set("device", device);
    if (expiresIn !== undefined) cliParams.set("expiresIn", String(expiresIn));

    return (
      <Navigate
        to={pluginPath("/login")}
        search={pluginSearch({ redirect: `/cli?${cliParams}` })}
        replace
      />
    );
  }

  if (isDelegateMode) {
    const mismatchForDelegate =
      !!configAccount && !!signedInAccountId && signedInAccountId !== configAccount;

    return (
      <Page>
        <Card className="p-6 space-y-4">
          <h1 className="text-lg font-semibold text-foreground" data-testid="cli.heading">
            Approve gasless publish key
          </h1>
          <p className="text-sm text-muted-foreground">
            The CLI on {device ?? "this machine"} minted a scoped function-call key. Approving adds
            it to <span className="font-mono">{signedInAccountId}</span>, restricted to{" "}
            <span className="font-mono">{contract}</span> — your wallet handles the approval. The
            CLI keeps the private key locally so publishes stay gasless and headless.
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all">{pubKey}</p>
          {mismatchForDelegate && (
            <p className="text-xs text-yellow-600" data-testid="cli.account-mismatch">
              Your signed-in NEAR account differs from the configured account — the delegate key can
              only sign for your signed-in account.
            </p>
          )}
          <Button
            onClick={() => addDelegateKeyMutation.mutate()}
            disabled={addDelegateKeyMutation.isPending}
            data-testid="cli.approve-delegate-button"
          >
            {addDelegateKeyMutation.isPending ? "approving…" : "Approve delegate key"}
          </Button>
        </Card>
      </Page>
    );
  }

  const accountMismatch =
    !!configAccount && !!signedInAccountId && signedInAccountId !== configAccount;

  return (
    <Page>
      <Card className="p-6 space-y-4">
        <h1 className="text-lg font-semibold text-foreground" data-testid="cli.heading">
          Connect CLI{configAccount ? ` to ${configAccount}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {device ? `The CLI on ${device}` : "A CLI on this machine"} is requesting a credential.
          This creates an API key named after it — revoke it any time under Settings → API keys.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          signed in as {signedInAccountId ?? session.user.name}
        </p>
        {accountMismatch && (
          <p className="text-xs text-yellow-600" data-testid="cli.account-mismatch">
            Your signed-in NEAR account differs from the configured account. Publishes always use
            the account configured in bos.config.json.
          </p>
        )}
        <Button
          onClick={() => mintMutation.mutate()}
          disabled={mintMutation.isPending}
          data-testid="cli.connect-button"
        >
          {mintMutation.isPending ? "creating credential…" : "Connect CLI"}
        </Button>
      </Card>
    </Page>
  );
}

function Page({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className={cn("w-full max-w-lg", className)}>{children}</div>
    </div>
  );
}

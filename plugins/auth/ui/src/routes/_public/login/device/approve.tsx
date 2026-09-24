import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sanitizeUserCode } from "./-user-code";

type SearchParams = {
  user_code?: string;
  pubKey?: string;
  contract?: string;
  account?: string;
  network?: string;
  source?: string;
};

export const Route = createFileRoute("/_public/login/device/approve")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    user_code: sanitizeUserCode(search.user_code),
    pubKey: typeof search.pubKey === "string" ? search.pubKey : undefined,
    contract: typeof search.contract === "string" ? search.contract : undefined,
    account: typeof search.account === "string" ? search.account : undefined,
    network: typeof search.network === "string" ? search.network : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: DeviceApprovePage,
});

function DeviceApprovePage() {
  const navigate = useNavigate();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const { user_code, pubKey, contract, account: configAccount, source } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const nearAccountsQuery = useQuery({
    queryKey: ["near-accounts"],
    queryFn: async () => {
      const { data, error } = await auth.near.listAccounts();
      if (error) throw new Error(error.message);
      return data as unknown as {
        accounts: { accountId: string }[];
        activeAccount: { accountId: string } | null;
      };
    },
    enabled: !!session?.user && !!pubKey && !!contract,
  });
  const signedInAccountId = nearAccountsQuery.data?.activeAccount?.accountId ?? null;

  const addDelegateKey = useMutation({
    mutationFn: async () => {
      if (!pubKey || !contract) throw new Error("Missing delegate-key parameters");
      if (!signedInAccountId) throw new Error("Connect a NEAR account first");
      const client = auth.near.getNearClient();
      await client
        .transaction(signedInAccountId)
        .addKey(pubKey, {
          type: "functionCall",
          receiverId: contract,
          methodNames: ["__fastdata_kv"],
          allowance: "1 NEAR",
        })
        .send();
      return true;
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add delegate key");
    },
  });

  if (!session?.user) {
    return <NavigateToLogin userCode={user_code} />;
  }

  const isDelegateMode = !!pubKey && !!contract;

  const handleApprove = async () => {
    if (!user_code) return;
    setPending(true);
    setError(null);
    if (isDelegateMode) {
      try {
        await addDelegateKey.mutateAsync();
      } catch {
        setPending(false);
        setError("The wallet did not add the delegate key. Nothing was approved — try again.");
        return;
      }
    }
    const { error: approveError } = await auth.device.approve({ userCode: user_code });
    setPending(false);
    if (approveError) {
      setError("Could not approve this code. It may have expired or been claimed elsewhere.");
      return;
    }
    if (isDelegateMode || source === "cli") {
      setApproved(true);
      toast.success("Approved — return to your terminal");
      return;
    }
    toast.success("Approved — your other device is signing in");
    void navigate({ to: "/dashboard" });
  };

  const handleDeny = async () => {
    if (!user_code) return;
    setPending(true);
    await auth.device.deny({ userCode: user_code });
    setPending(false);
    toast.info("Sign-in request denied");
    void navigate({ to: "/", replace: true });
  };

  if (approved) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-2 text-center">
          <h1
            className="text-lg font-semibold text-foreground"
            data-testid="device.approved-heading"
          >
            Connected — return to your terminal
          </h1>
          <p className="text-sm text-muted-foreground">
            The CLI received the credential. You can close this window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
        <div className="space-y-1 text-center">
          <h1
            className="text-xl font-semibold text-foreground"
            data-testid="device.approve-heading"
          >
            {isDelegateMode ? "Approve gasless publish key" : "Approve device"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDelegateMode
              ? "Approving adds the scoped key to your account — your wallet handles the approval. The CLI keeps the private key locally so publishes stay gasless and headless."
              : "Approving will sign in this account on the other device."}
          </p>
        </div>

        {isDelegateMode && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-mono break-all">{pubKey}</p>
            {configAccount && signedInAccountId && signedInAccountId !== configAccount && (
              <p className="text-xs text-yellow-600" data-testid="device.account-mismatch">
                Your signed-in NEAR account differs from the configured account — the delegate key
                can only sign for your signed-in account.
              </p>
            )}
          </div>
        )}

        {user_code ? (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">
              Make sure this code matches the one on the device
            </p>
            <p
              className="font-mono text-lg tracking-widest text-foreground"
              data-testid="device.approve-code"
            >
              {user_code}
            </p>
          </div>
        ) : (
          <p className="text-sm text-center text-muted-foreground">No code provided.</p>
        )}

        {error && (
          <p className="text-sm text-destructive text-center" data-testid="device.approve-error">
            {error}
          </p>
        )}

        {user_code && (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={handleApprove}
              disabled={pending}
              data-testid="device.approve-button"
            >
              {pending ? "working…" : isDelegateMode ? "Approve delegate key" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleDeny}
              disabled={pending}
              data-testid="device.deny-button"
            >
              Deny
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function NavigateToLogin({ userCode }: { userCode?: string }) {
  const navigate = useNavigate();
  const target = userCode ? `/login/device?user_code=${userCode}` : "/login/device";
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5 text-center">
        <h1 className="text-xl font-semibold text-foreground" data-testid="device.approve-heading">
          Sign in required
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in on this device to approve the request.
        </p>
        <Button
          type="button"
          className="w-full"
          onClick={() => void navigate({ to: "/login", search: { redirect: target } })}
          data-testid="device.approve-signin-button"
        >
          Sign in to continue
        </Button>
      </div>
    </div>
  );
}

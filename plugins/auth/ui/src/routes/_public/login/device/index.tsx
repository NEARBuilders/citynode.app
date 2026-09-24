import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeUserCode } from "./-user-code";

type SearchParams = {
  user_code?: string;
  pubKey?: string;
  contract?: string;
  account?: string;
  network?: string;
  source?: string;
};

export const Route = createFileRoute("/_public/login/device/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    user_code: sanitizeUserCode(search.user_code),
    pubKey: typeof search.pubKey === "string" ? search.pubKey : undefined,
    contract: typeof search.contract === "string" ? search.contract : undefined,
    account: typeof search.account === "string" ? search.account : undefined,
    network: typeof search.network === "string" ? search.network : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: DeviceVerifyPage,
});

function DeviceVerifyPage() {
  const navigate = useNavigate();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const { user_code, pubKey, contract, account, network, source } = Route.useSearch();
  const [code, setCode] = useState(user_code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!session?.user || !user_code || claiming) return;
    setClaiming(true);
    void auth.device({ query: { user_code } }).then(({ data, error }) => {
      if (error || !data) {
        setClaiming(false);
        setError("This code is invalid or has expired. Ask for a new one.");
        return;
      }
      void navigate({
        to: "/login/device/approve",
        search: { user_code, pubKey, contract, account, network, source },
      });
    });
  }, [session?.user, user_code, claiming, auth, navigate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const cleaned = code.trim().replace(/-/g, "").toUpperCase();
    if (!cleaned) return;
    void navigate({
      to: "/login/device",
      search: { user_code: cleaned, pubKey, contract, account, network, source },
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-foreground" data-testid="device.verify-heading">
            Device sign-in
          </h1>
          <p className="text-sm text-muted-foreground">
            {session?.user
              ? "A device is asking to sign in to your account."
              : "Sign in on this device to approve it."}
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center" data-testid="device.verify-error">
            {error}
          </p>
        )}

        {user_code ? (
          <p
            className="text-center font-mono text-lg tracking-widest text-foreground"
            data-testid="device.verified-code"
          >
            {user_code}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="XXXX-XXXX"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              className="text-center font-mono tracking-widest uppercase"
              data-testid="device.user-code-input"
            />
            <Button type="submit" className="w-full" data-testid="device.verify-button">
              Continue
            </Button>
          </form>
        )}

        {claiming && (
          <p className="text-sm text-center text-muted-foreground" data-testid="device.claiming">
            Verifying…
          </p>
        )}

        {!session?.user && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const deviceSearch = new URLSearchParams();
              for (const [key, value] of Object.entries({
                user_code,
                pubKey,
                contract,
                account,
                network,
                source,
              })) {
                if (value) deviceSearch.set(key, value);
              }
              const query = deviceSearch.toString();
              void navigate({
                to: "/login",
                search: { redirect: `/login/device${query ? `?${query}` : ""}` },
              });
            }}
            data-testid="device.signin-redirect-button"
          >
            Sign in to continue
          </Button>
        )}
      </div>
    </div>
  );
}

import { DeviceMobileIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { LoginMessageId } from "@/i18n/catalogs";
import { useLoginTranslation } from "@/i18n/runtime";
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
  const translate = useLoginTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const search = Route.useSearch();
  const { user_code, pubKey, contract, account, network, source } = search;
  const [code, setCode] = useState(user_code ?? "");
  const [error, setError] = useState<LoginMessageId | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user || !user_code || checkedRef.current === user_code) return;
    checkedRef.current = user_code;
    setClaiming(true);
    setError(null);
    const check = async () => {
      const { data, error } = await auth.device({ query: { user_code } });
      if (error || !data) {
        setError("auth.pair.invalidCode");
        return;
      }
      await navigate({
        to: "/login/device/approve",
        search: { user_code, pubKey, contract, account, network, source },
      });
    };
    check()
      .catch(() => setError("auth.common.connectionHint"))
      .finally(() => setClaiming(false));
  }, [
    session?.user,
    user_code,
    attempt,
    auth,
    navigate,
    pubKey,
    contract,
    account,
    network,
    source,
  ]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = sanitizeUserCode(code);
    if (!cleaned) {
      setError("auth.pair.invalidCode");
      return;
    }
    setError(null);
    if (cleaned === user_code) {
      checkedRef.current = null;
      setAttempt((value) => value + 1);
      return;
    }
    void navigate({
      to: "/login/device",
      search: { user_code: cleaned, pubKey, contract, account, network, source },
    });
  };

  const signInToContinue = () => {
    void navigate({
      to: "/login",
      search: { redirect: router.buildLocation({ to: "/login/device", search }).href },
    });
  };

  const showCode = !!user_code && !error;

  return (
    <AuthPanel
      icon={<DeviceMobileIcon />}
      title={translate("auth.pair.title")}
      titleTestId="device-verify-heading"
      description={showCode ? translate("auth.pair.matches") : translate("auth.pair.enterCode")}
    >
      {showCode ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-muted px-6 py-8">
          <span
            className="font-mono text-3xl font-semibold tracking-widest break-all text-foreground"
            data-testid="device-verified-code"
          >
            {user_code}
          </span>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="device-user-code" className="sr-only">
              {translate("auth.pair.deviceCode")}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="device-user-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="one-time-code"
                className="flex-1 font-mono"
                data-testid="device-user-code-input"
              />
              <Button type="submit" disabled={!code.trim()} data-testid="device-verify-button">
                {translate("auth.common.continue")}
              </Button>
            </div>
          </Field>
        </form>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" data-testid="device-verify-error">
          {translate(error)}
        </p>
      )}

      {claiming && (
        <p
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          data-testid="device-claiming"
        >
          <Spinner />
          {translate("auth.pair.checking")}
        </p>
      )}

      {!session?.user && (
        <Button
          type="button"
          size="lg"
          variant={showCode ? "default" : "outline"}
          className="w-full"
          onClick={signInToContinue}
          data-testid="device-signin-redirect-button"
        >
          {translate("auth.pair.signInContinue")}
        </Button>
      )}
    </AuthPanel>
  );
}

import { CheckCircleIcon, DevicesIcon, KeyIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { AuthPanel } from "@/components/auth-panel";
import { InfoPopover } from "@/components/info-popover";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { LoginMessageId } from "@/i18n/catalogs";
import { authErrorMessage } from "@/i18n/error-message";
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
  const translate = useLoginTranslation();
  const navigate = useNavigate();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const { user_code, pubKey, contract, account: configAccount, source } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginMessageId | null>(null);
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
      toast.error(authErrorMessage(error, translate));
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
        setError("auth.pair.keyDeclined");
        return;
      }
    }
    const { error: approveError } = await auth.device.approve({ userCode: user_code });
    setPending(false);
    if (approveError) {
      setError("auth.pair.approveFailed");
      return;
    }
    if (isDelegateMode || source === "cli") {
      setApproved(true);
      toast.success(translate("auth.pair.approvedTerminal"));
      return;
    }
    toast.success(translate("auth.pair.approvedDevice"));
    void navigate({ to: "/dashboard" });
  };

  const handleDeny = async () => {
    if (!user_code) return;
    setPending(true);
    await auth.device.deny({ userCode: user_code });
    setPending(false);
    toast.info(translate("auth.pair.denied"));
    void navigate({ to: "/", replace: true });
  };

  if (approved) {
    return (
      <AuthPanel
        icon={<CheckCircleIcon />}
        title={translate("auth.pair.returnTerminal")}
        titleTestId="device.approved-heading"
        description={translate("auth.pair.credentialReceived")}
      />
    );
  }

  return (
    <AuthPanel
      icon={isDelegateMode ? <KeyIcon /> : <DevicesIcon />}
      title={
        isDelegateMode
          ? translate("auth.pair.approvePublish")
          : translate("auth.pair.approveSignIn")
      }
      titleTestId="device.approve-heading"
      description={
        isDelegateMode
          ? translate("auth.pair.publishDescription")
          : translate("auth.pair.signInDescription")
      }
    >
      {user_code ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-muted px-6 py-8">
          <span className="text-sm text-muted-foreground">{translate("auth.pair.checkCode")}</span>
          <span
            className="font-mono text-3xl font-semibold tracking-widest break-all text-foreground"
            data-testid="device.approve-code"
          >
            {user_code}
          </span>
        </div>
      ) : (
        <p
          className="text-center text-sm text-muted-foreground"
          data-testid="device.approve-missing-code"
        >
          {translate("auth.pair.noCode")}
        </p>
      )}

      {isDelegateMode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{translate("auth.pair.publicKey")}</span>
            <InfoPopover
              title={translate("auth.pair.publishKey")}
              body={translate("auth.pair.publishAllowance")}
            />
          </div>
          <p
            className="break-all font-mono text-xs text-foreground"
            data-testid="device.approve-pubkey"
          >
            {pubKey}
          </p>
          {configAccount && signedInAccountId && signedInAccountId !== configAccount && (
            <p
              className="text-sm wrap-anywhere text-warning-muted-foreground"
              data-testid="device.account-mismatch"
            >
              {translate("auth.pair.accountMismatch", {
                signedIn: signedInAccountId,
                configured: configAccount,
              })}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" data-testid="device.approve-error">
          {translate(error)}
        </p>
      )}

      {user_code && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={handleApprove}
            disabled={pending}
            data-testid="device.approve-button"
          >
            {pending && <Spinner data-icon="inline-start" />}
            {isDelegateMode ? translate("auth.pair.approveKey") : translate("auth.common.approve")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={handleDeny}
            disabled={pending}
            data-testid="device.deny-button"
          >
            {translate("auth.common.deny")}
          </Button>
        </div>
      )}
    </AuthPanel>
  );
}

function NavigateToLogin({ userCode }: { userCode?: string }) {
  const translate = useLoginTranslation();
  const navigate = useNavigate();
  const target = userCode ? `/login/device?user_code=${userCode}` : "/login/device";
  return (
    <AuthPanel
      icon={<DevicesIcon />}
      title={translate("auth.pair.signInToApprove")}
      titleTestId="device.approve-heading"
      description={translate("auth.pair.signInHint")}
    >
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => void navigate({ to: "/login", search: { redirect: target } })}
        data-testid="device.approve-signin-button"
      >
        {translate("auth.pair.signInContinue")}
      </Button>
    </AuthPanel>
  );
}

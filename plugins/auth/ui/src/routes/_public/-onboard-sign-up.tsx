import { FingerprintIcon, WalletIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { isPasskeyWalletAvailable, type PasskeyWalletNetwork } from "better-near-auth/client";
import {
  createAccountWithPasskey,
  isUnsupportedAuthenticatorError,
  refreshSessionCache,
  signInWithPasskey,
  useAuthClient,
} from "everything-dev/ui/auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authErrorMessage } from "@/i18n/error-message";
import { useLoginTranslation } from "@/i18n/runtime";
import { markAddEmailPromptPending } from "@/lib/add-email-prompt";

type Mode = "create" | "existing";

export function OnboardSignUp({
  networkId,
  onAccountCreated,
}: {
  networkId: PasskeyWalletNetwork;
  onAccountCreated: () => void;
}) {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("create");
  const [pending, setPending] = useState<"create" | "passkey" | "near" | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [passkeyMissing, setPasskeyMissing] = useState(false);
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null);
  const walletAvailable = isPasskeyWalletAvailable(networkId);

  useEffect(() => {
    void auth.near.detectNearAccount().then((result: { accountId?: string | null } | null) => {
      if (result?.accountId) setDetectedAccount(result.accountId);
    });
  }, [auth.near]);

  const handleCreate = async () => {
    setPending("create");
    setUnsupported(false);
    await createAccountWithPasskey(auth, {
      onSuccess: async () => {
        markAddEmailPromptPending();
        onAccountCreated();
        await refreshSessionCache(auth, queryClient);
        setPending(null);
      },
      onError: (error) => {
        setPending(null);
        if (isUnsupportedAuthenticatorError(error)) setUnsupported(true);
        else toast.error(authErrorMessage(error, translate));
      },
    });
  };

  const handlePasskeySignIn = async () => {
    setPending("passkey");
    setPasskeyMissing(false);
    await signInWithPasskey(auth, {
      onSuccess: async () => {
        await refreshSessionCache(auth, queryClient);
        setPending(null);
      },
      onError: () => {
        setPending(null);
        setPasskeyMissing(true);
      },
    });
  };

  const handleNear = async (switchWallet = false) => {
    setPending("near");
    try {
      if (switchWallet) await auth.near.disconnect();
      await auth.signIn.near({
        onSuccess: async () => {
          await refreshSessionCache(auth, queryClient);
          setPending(null);
        },
        onError: () => {
          setPending(null);
          toast.error(translate("auth.onboard.walletFailed"));
        },
      });
    } catch {
      setPending(null);
      toast.error(translate("auth.onboard.walletFailed"));
    }
  };

  const nearButtons = (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => void handleNear()}
        disabled={pending !== null}
        className="w-full"
        data-testid="onboard.signin-button"
      >
        {pending === "near" ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <WalletIcon data-icon="inline-start" />
        )}
        <span className="min-w-0 truncate">
          {detectedAccount
            ? translate("auth.login.near.continueAs", { account: detectedAccount })
            : translate("auth.onboard.continueNear")}
        </span>
      </Button>
      {detectedAccount ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => void handleNear(true)}
          disabled={pending !== null}
        >
          {translate("auth.onboard.anotherWallet")}
        </Button>
      ) : null}
    </div>
  );

  if (mode === "existing") {
    return (
      <div className="flex flex-col gap-3" data-testid="onboard.existing-account">
        <Button
          type="button"
          size="lg"
          onClick={() => void handlePasskeySignIn()}
          disabled={pending !== null}
          className="w-full"
          data-testid="onboard.passkey-signin-button"
        >
          {pending === "passkey" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <FingerprintIcon data-icon="inline-start" />
          )}
          {pending === "passkey"
            ? translate("auth.onboard.passkeyPending")
            : translate("auth.onboard.passkeySignIn")}
        </Button>
        {passkeyMissing ? (
          <p
            className="text-center text-sm text-muted-foreground"
            data-testid="onboard.no-passkey-hint"
          >
            {translate("auth.onboard.noPasskey")}
          </p>
        ) : null}
        {nearButtons}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMode("create")}
          disabled={pending !== null}
          className="self-center"
          data-testid="onboard.create-account-link"
        >
          {translate("auth.onboard.new")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        size="lg"
        onClick={() => void handleCreate()}
        disabled={pending !== null}
        className="w-full"
        data-testid="onboard.create-account-button"
      >
        {pending === "create" ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <FingerprintIcon data-icon="inline-start" />
        )}
        {pending === "create"
          ? translate("auth.onboard.passkeyPending")
          : translate("auth.onboard.create")}
      </Button>
      <p className="text-center text-sm text-muted-foreground" data-testid="onboard.passkey-note">
        {walletAvailable
          ? translate("auth.onboard.createWalletDescription")
          : translate("auth.onboard.createDescription")}
      </p>
      {unsupported ? (
        <div className="flex flex-col gap-3" data-testid="onboard.unsupported-authenticator">
          <p className="text-center text-sm text-muted-foreground">
            {translate("auth.onboard.unsupported")}
          </p>
          {nearButtons}
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        onClick={() => setMode("existing")}
        disabled={pending !== null}
        className="self-center"
        data-testid="onboard.existing-account-button"
      >
        {translate("auth.onboard.existing")}
      </Button>
    </div>
  );
}

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

type Mode = "create" | "existing";

export function OnboardSignUp({
  networkId,
  onAccountCreated,
}: {
  networkId: PasskeyWalletNetwork;
  onAccountCreated: () => void;
}) {
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
        onAccountCreated();
        await refreshSessionCache(auth, queryClient);
        setPending(null);
      },
      onError: (error) => {
        setPending(null);
        if (isUnsupportedAuthenticatorError(error)) setUnsupported(true);
        else toast.error(error.message);
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
        onError: (error: { message?: string }) => {
          setPending(null);
          toast.error(error?.message || "Failed to sign in");
        },
      });
    } catch {
      setPending(null);
      toast.error("Failed to connect your NEAR wallet");
    }
  };

  const nearButtons = (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleNear()}
        disabled={pending !== null}
        className="w-full"
        data-testid="onboard.signin-button"
      >
        {pending === "near"
          ? "connecting..."
          : detectedAccount
            ? `Continue as ${detectedAccount}`
            : "Sign in with a NEAR wallet"}
      </Button>
      {detectedAccount ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => void handleNear(true)}
          disabled={pending !== null}
          className="w-full"
        >
          Use another wallet
        </Button>
      ) : null}
    </div>
  );

  if (mode === "existing") {
    return (
      <div className="space-y-3" data-testid="onboard.existing-account">
        <Button
          type="button"
          variant="default"
          onClick={() => void handlePasskeySignIn()}
          disabled={pending !== null}
          className="w-full"
          data-testid="onboard.passkey-signin-button"
        >
          {pending === "passkey" ? "waiting for passkey..." : "Sign in with passkey"}
        </Button>
        {passkeyMissing ? (
          <p
            className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground"
            data-testid="onboard.no-passkey-hint"
          >
            No passkey on this device? Sign in with your phone, or connect your NEAR wallet.
          </p>
        ) : null}
        {nearButtons}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMode("create")}
          disabled={pending !== null}
          className="w-full"
          data-testid="onboard.create-account-link"
        >
          I'm new here
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="default"
        onClick={() => void handleCreate()}
        disabled={pending !== null}
        className="w-full"
        data-testid="onboard.create-account-button"
      >
        {pending === "create" ? "waiting for passkey..." : "Create account"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setMode("existing")}
        disabled={pending !== null}
        className="w-full"
        data-testid="onboard.existing-account-button"
      >
        I already have an account
      </Button>
      {unsupported ? (
        <div className="space-y-3" data-testid="onboard.unsupported-authenticator">
          <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            This device can't create a supported passkey. Sign in with a NEAR wallet instead.
          </p>
          {nearButtons}
        </div>
      ) : null}
      <p className="text-xs text-center text-muted-foreground" data-testid="onboard.passkey-note">
        {walletAvailable
          ? "Creating an account uses your device passkey and sets up a NEAR wallet for you — no seed phrase."
          : "Creating an account uses your device passkey. A passkey wallet isn't available on this network, so no NEAR wallet is created."}
      </p>
    </div>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  isPasskeyAutofillAvailable,
  refreshSessionCache,
  sessionQueryOptions,
  signInWithPasskey,
  useAuthClient,
} from "everything-dev/ui/auth";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnderConstruction } from "@/components/under-construction";
import { PairPanel } from "../-pair-panel";

type SearchParams = {
  redirect?: string;
};

const DEVICE_APPROVAL_PATH = /^\/login\/device(\/approve)?(\?|$)/;

function sanitizeRedirect(url: unknown): string {
  if (
    typeof url !== "string" ||
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.startsWith("/\\")
  ) {
    return "/dashboard";
  }
  if (url.startsWith("/login") && !DEVICE_APPROVAL_PATH.test(url)) {
    return "/dashboard";
  }
  return url;
}

export const Route = createFileRoute("/_public/login/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const { queryClient, authClient } = context;
    const session = await queryClient.query(sessionQueryOptions(authClient));
    if (session?.user && !session.user.banned) {
      throw redirect({ href: sanitizeRedirect(search.redirect) });
    }
  },
  component: LoginPage,
});

type AuthError = { code?: string; message?: string } | Error;

function handleError(error: AuthError) {
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : "Failed to sign in";
  if (code === "UNAUTHORIZED_NONCE_REPLAY") toast.error("Sign-in already used");
  else if (code === "UNAUTHORIZED_INVALID_SIGNATURE") toast.error("Invalid signature");
  else if (code === "SIGNER_NOT_AVAILABLE") toast.error("NEAR wallet not available");
  else if (code === "RECIPIENT_MISMATCH") toast.error("Sign-in configuration error");
  else if (code === "UNAUTHORIZED_INVALID_NONCE") toast.error("Session expired, please try again");
  else toast.error(message || "Failed to sign in");
}

function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const redirect = sanitizeRedirect(Route.useSearch().redirect);
  const { runtimeConfig } = Route.useRouteContext();

  const [nearPending, setNearPending] = useState(false);
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyMissing, setPasskeyMissing] = useState(false);
  const [passkeyAutofill, setPasskeyAutofill] = useState(false);
  const [showPair, setShowPair] = useState(false);

  useEffect(() => {
    void auth.near.detectNearAccount().then((result: { accountId?: string | null } | null) => {
      if (result?.accountId) {
        setDetectedAccount(result.accountId);
      }
    });
  }, [auth.near]);

  const handleSuccess = async (message: string) => {
    toast.success(message);
    await refreshSessionCache(auth, queryClient);
    await navigate({ href: redirect, replace: true });
  };
  const onAutofillSignIn = useEffectEvent(() => void handleSuccess("Signed in with passkey"));

  useEffect(() => {
    let cancelled = false;
    void isPasskeyAutofillAvailable().then((available) => {
      if (!available || cancelled) return;
      setPasskeyAutofill(true);
      void signInWithPasskey(auth, {
        autoFill: true,
        onSuccess: onAutofillSignIn,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleNear = async () => {
    setNearPending(true);
    await auth.signIn.near({
      onSuccess: async () => {
        setNearPending(false);
        await handleSuccess("Signed in with NEAR");
      },
      onError: (error: { code?: string; message?: string }) => {
        setNearPending(false);
        handleError(error);
      },
    });
  };

  const handlePasskey = async () => {
    setPasskeyPending(true);
    setPasskeyMissing(false);
    await signInWithPasskey(auth, {
      onSuccess: async () => {
        setPasskeyPending(false);
        await handleSuccess("Signed in with passkey");
      },
      onError: () => {
        setPasskeyPending(false);
        setPasskeyMissing(true);
      },
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="w-full rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold text-foreground" data-testid="login.heading">
              Sign in
            </h1>
            <p className="text-sm text-muted-foreground">Connect your NEAR wallet to continue.</p>
          </div>

          {showPair ? (
            <PairPanel redirect={redirect} onClose={() => setShowPair(false)} />
          ) : (
            <>
              {passkeyAutofill ? (
                <Field>
                  <FieldLabel htmlFor="login-passkey-autofill">Passkey</FieldLabel>
                  <Input
                    id="login-passkey-autofill"
                    type="text"
                    name="username"
                    autoComplete="username webauthn"
                    placeholder="Choose a saved passkey"
                    data-testid="login.passkey-autofill"
                  />
                </Field>
              ) : null}
              <Button
                type="button"
                variant="default"
                onClick={handlePasskey}
                disabled={passkeyPending || nearPending}
                className="w-full"
                data-testid="login.passkey-button"
              >
                {passkeyPending ? "waiting for passkey..." : "sign in with passkey"}
              </Button>
              {passkeyMissing ? (
                <p
                  className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground"
                  data-testid="login.no-passkey-hint"
                >
                  No passkey on this device? Sign in with your phone, or connect your NEAR wallet.
                </p>
              ) : null}
              {detectedAccount ? (
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleNear}
                    disabled={nearPending}
                    className="w-full"
                    data-testid="near.signin-button"
                  >
                    {nearPending ? "connecting..." : `Continue as ${detectedAccount}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      setNearPending(true);
                      try {
                        await auth.near.disconnect();
                        await auth.signIn.near({
                          onSuccess: async () => {
                            setNearPending(false);
                            await handleSuccess("Signed in with NEAR");
                          },
                          onError: (error: { code?: string; message?: string }) => {
                            setNearPending(false);
                            handleError(error);
                          },
                        });
                      } catch {
                        setNearPending(false);
                        toast.error("Failed to disconnect wallet");
                      }
                    }}
                    disabled={nearPending}
                    className="w-full"
                  >
                    Use another wallet
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  onClick={handleNear}
                  disabled={nearPending}
                  className="w-full"
                  data-testid="near.signin-button"
                >
                  {nearPending ? "connecting..." : "connect with NEAR"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowPair(true)}
                data-testid="login.device-button"
              >
                sign in with phone
              </Button>
            </>
          )}
        </div>

        <UnderConstruction
          sourceFile="plugins/auth/ui/src/routes/_public/login/index.tsx"
          runtimeConfig={runtimeConfig}
        />
      </div>
    </div>
  );
}

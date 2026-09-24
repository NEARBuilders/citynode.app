import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate, redirect, useNavigate } from "@tanstack/react-router";
import type { SessionData } from "everything-dev/ui/auth";
import {
  refreshSessionCache,
  sessionQueryOptions,
  signInWithPasskey,
  useAuthClient,
} from "everything-dev/ui/auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UnderConstruction } from "@/components/under-construction";
import type { LoginTranslator } from "@/i18n/catalogs";
import { LoginLanguageSelector } from "@/i18n/language-selector";
import { LoginI18nProvider, useLoginTranslation } from "@/i18n/runtime";
import { PairPanel } from "./-pair-panel";

type SearchParams = {
  redirect?: string;
};

function sanitizeRedirect(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
    return "/dashboard";
  }
  return url;
}

export const Route = createFileRoute("/_public/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const { queryClient, authClient } = context;
    // Read the session exactly like the authed route guards do (ensureSession
    // in ui/src/lib/auth-guards.ts): an awaited queryClient.query() over the
    // same query options. The optimistic context/cache read disagreed with
    // the guard on a stale value, and the two redirect throwers ping-ponged
    // /login <-> /dashboard until the router tripped its redirect limit.
    const session = await queryClient.query(sessionQueryOptions(authClient, context.session));

    // Banned users must not be bounced into the /login#banned <-> /dashboard
    // redirect cycle — the authed guard sends them back here.
    if (session?.user && !session.user.banned) {
      throw redirect({ to: search.redirect });
    }
  },
  loader: ({ context }) => {
    const initialSession = context.session;
    void context.queryClient.prefetchQuery(sessionQueryOptions(context.authClient, initialSession));
  },
  component: LoginPage,
});

type AuthError = { code?: string; message?: string } | Error;

function handleError(error: AuthError, t: LoginTranslator) {
  const code = "code" in error ? error.code : undefined;
  if (code === "UNAUTHORIZED_NONCE_REPLAY") toast.error(t("auth.login.error.used"));
  else if (code === "UNAUTHORIZED_INVALID_SIGNATURE") {
    toast.error(t("auth.login.error.signature"));
  } else if (code === "SIGNER_NOT_AVAILABLE") {
    toast.error(t("auth.login.error.walletUnavailable"));
  } else if (code === "RECIPIENT_MISMATCH") {
    toast.error(t("auth.login.error.configuration"));
  } else if (code === "UNAUTHORIZED_INVALID_NONCE") {
    toast.error(t("auth.login.error.expired"));
  } else toast.error(t("auth.login.error.generic"));
}

function LoginPage() {
  return (
    <LoginI18nProvider>
      <LoginPageContent />
    </LoginI18nProvider>
  );
}

function LoginPageContent() {
  const navigate = useNavigate();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const t = useLoginTranslation();
  const { data: session } = useQuery(sessionQueryOptions(auth, undefined));
  const { redirect } = Route.useSearch();
  const { runtimeConfig } = Route.useRouteContext();

  const [nearPending, setNearPending] = useState(false);
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [showPair, setShowPair] = useState(false);

  useEffect(() => {
    void auth.near.detectNearAccount().then((result: { accountId?: string | null } | null) => {
      if (result?.accountId) {
        setDetectedAccount(result.accountId);
      }
    });
  }, [auth.near]);

  const handleSuccess = async (message: string, session?: SessionData | null) => {
    toast.success(message);
    // Refresh the session cache authoritatively (cookie cache disabled) BEFORE
    // navigating — the authed route guards read this cache synchronously, and
    // navigating against a stale signed-out value ping-pongs login <-> dashboard
    // until TanStack Router throws "Too many redirects".
    await refreshSessionCache(auth, queryClient, session);
    await navigate({ to: redirect, replace: true });
  };

  const handleNear = async () => {
    setNearPending(true);
    await auth.signIn.near({
      onSuccess: async () => {
        setNearPending(false);
        await handleSuccess(t("auth.login.success.near"));
      },
      onError: (error: { code?: string; message?: string }) => {
        setNearPending(false);
        handleError(error, t);
      },
    });
  };

  const handlePasskey = async () => {
    setPasskeyPending(true);
    await signInWithPasskey(auth, {
      onSuccess: async (session) => {
        setPasskeyPending(false);
        await handleSuccess(t("auth.login.success.passkey"), session);
      },
      onError: () => {
        setPasskeyPending(false);
        toast.error(t("auth.login.error.passkey"));
      },
    });
  };

  if (session?.user && !session.user.banned) {
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="w-full rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
          {!showPair && (
            <div className="flex justify-end">
              <LoginLanguageSelector />
            </div>
          )}
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold text-foreground" data-testid="login.heading">
              {t("auth.login.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
          </div>

          {showPair ? (
            <PairPanel redirect={redirect} onClose={() => setShowPair(false)} />
          ) : (
            <>
              <Button
                type="button"
                variant="default"
                onClick={handlePasskey}
                disabled={passkeyPending || nearPending}
                className="w-full"
                data-testid="login.passkey-button"
              >
                {passkeyPending ? t("auth.login.passkey.pending") : t("auth.login.passkey.action")}
              </Button>
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
                    {nearPending
                      ? t("auth.login.near.pending")
                      : t("auth.login.near.continueAs", { account: detectedAccount })}
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
                            await handleSuccess(t("auth.login.success.near"));
                          },
                          onError: (error: { code?: string; message?: string }) => {
                            setNearPending(false);
                            handleError(error, t);
                          },
                        });
                      } catch {
                        setNearPending(false);
                        toast.error(t("auth.login.error.disconnect"));
                      }
                    }}
                    disabled={nearPending}
                    className="w-full"
                  >
                    {t("auth.login.near.useAnother")}
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
                  {nearPending ? t("auth.login.near.pending") : t("auth.login.near.action")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowPair(true)}
                data-testid="login.device-button"
              >
                {t("auth.login.phone.action")}
              </Button>
            </>
          )}
        </div>

        <UnderConstruction
          sourceFile="plugins/auth/ui/src/routes/_anon/login.tsx"
          runtimeConfig={runtimeConfig}
        />
      </div>
    </div>
  );
}

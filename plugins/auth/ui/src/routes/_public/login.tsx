import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate, redirect, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UnderConstruction } from "@/components/under-construction";

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
  beforeLoad: ({ context, search }) => {
    const { queryClient, authClient } = context;
    const initialSession = context.session;
    const session =
      initialSession ??
      queryClient.getQueryData(sessionQueryOptions(authClient, initialSession).queryKey);

    if (session?.user) {
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
  const { data: session } = useQuery(sessionQueryOptions(auth, undefined));
  const { redirect } = Route.useSearch();
  const { runtimeConfig } = Route.useRouteContext();

  const [nearPending, setNearPending] = useState(false);
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null);

  useEffect(() => {
    void auth.near.detectNearAccount().then((result: { accountId?: string | null } | null) => {
      if (result?.accountId) {
        setDetectedAccount(result.accountId);
      }
    });
  }, [auth.near]);

  const handleSuccess = async (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ["session"] });
    void navigate({ to: redirect, replace: true });
  };

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

  if (session?.user) {
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="w-full rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold text-foreground" data-testid="login.heading">
              Sign in
            </h1>
            <p className="text-sm text-muted-foreground">Connect your NEAR wallet to continue.</p>
          </div>

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
        </div>

        <UnderConstruction
          sourceFile="plugins/auth/ui/src/routes/_anon/login.tsx"
          runtimeConfig={runtimeConfig}
        />
      </div>
    </div>
  );
}

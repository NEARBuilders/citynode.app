import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  refreshSessionCache,
  sessionQueryOptions,
  signInWithPasskey,
  useAuthClient,
} from "everything-dev/ui/auth";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getGatewayOrigin } from "@/lib/gateway-origin";

type SearchParams = {
  code?: string;
};

function sanitizeCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{10,64}$/.test(trimmed) ? trimmed : undefined;
}

export const Route = createFileRoute("/_public/onboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    code: sanitizeCode(search.code),
  }),
  component: OnboardPage,
});

function OnboardPage() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { code } = Route.useSearch();
  const { apiClient, runtimeConfig } = Route.useRouteContext();
  const gatewayHost = new URL(getGatewayOrigin(runtimeConfig)).host;
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const { data: info } = useQuery({
    queryKey: ["onboarding-info", code],
    queryFn: async () => {
      return apiClient.auth.getOnboardingCodeInfo({ code: code! });
    },
    enabled: !!code,
  });

  const [nearPending, setNearPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [detectedAccount, setDetectedAccount] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<{
    organizationName: string;
    eventName: string;
  } | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const redeemingRef = useRef(false);

  useEffect(() => {
    void auth.near.detectNearAccount().then((result: { accountId?: string | null } | null) => {
      if (result?.accountId) {
        setDetectedAccount(result.accountId);
      }
    });
  }, [auth.near]);

  useEffect(() => {
    if (!session?.user || !code || redeemingRef.current || redeemed || redeemError) return;
    redeemingRef.current = true;
    void apiClient.auth
      .redeemOnboardingCode({ code })
      .then((result) => {
        setRedeemed({ organizationName: result.organizationName, eventName: result.eventName });
        toast.success(`You've joined ${result.organizationName}`);
        void refreshSessionCache(auth, queryClient);
      })
      .catch((error: { message?: string }) => {
        setRedeemError(error?.message || "Could not join this organization");
      });
  }, [session?.user, code, redeemed, redeemError, auth, apiClient, queryClient]);

  const handleNear = async () => {
    setNearPending(true);
    await auth.signIn.near({
      onSuccess: async () => {
        setNearPending(false);
        await refreshSessionCache(auth, queryClient);
      },
      onError: (error: { code?: string; message?: string }) => {
        setNearPending(false);
        toast.error(error?.message || "Failed to sign in");
      },
    });
  };

  const handlePasskey = async () => {
    setPasskeyPending(true);
    await signInWithPasskey(auth, {
      onSuccess: async () => {
        setPasskeyPending(false);
        await refreshSessionCache(auth, queryClient);
      },
      onError: (error) => {
        setPasskeyPending(false);
        toast.error(error.message || "Passkey sign-in failed");
      },
    });
  };

  if (redeemed) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5 text-center">
          <h1 className="text-xl font-semibold text-foreground" data-testid="onboard.heading">
            You're in
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="onboard.success">
            You've joined{" "}
            <span className="text-foreground font-medium">{redeemed.organizationName}</span> for{" "}
            {redeemed.eventName}.
          </p>
          <div
            className="space-y-2 rounded-[8px] border border-border bg-muted p-4 text-left"
            data-testid="onboard.continue-on-computer"
          >
            <p className="text-sm font-medium text-foreground">Continue on your computer</p>
            <p className="text-sm text-muted-foreground">
              Open{" "}
              <span className="font-mono text-foreground" data-testid="onboard.gateway-origin">
                {gatewayHost}
              </span>{" "}
              on your laptop, choose "Sign in with phone", and scan the code with this phone.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <StatusCard
        title="Invalid invitation"
        description="This onboarding link is missing its code. Ask the organizer for a new QR code."
        testId="onboard.invalid"
      />
    );
  }

  if (info === null) {
    return (
      <StatusCard
        title="Invitation not found"
        description="This onboarding code is invalid. Ask the organizer for a new QR code."
        testId="onboard.not-found"
      />
    );
  }

  if (info.revoked || info.expired) {
    return (
      <StatusCard
        title="Invitation unavailable"
        description={
          info.revoked
            ? "This onboarding code was revoked by the organizer."
            : "This onboarding code has expired. Ask the organizer for a new one."
        }
        testId="onboard.unavailable"
      />
    );
  }

  if (redeemError) {
    return <StatusCard title="Could not join" description={redeemError} testId="onboard.error" />;
  }

  if (session?.user) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-3 text-center">
          <h1 className="text-xl font-semibold text-foreground" data-testid="onboard.heading">
            Joining {info.organizationName}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="onboard.status">
            Joining {info.eventName}…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-foreground" data-testid="onboard.heading">
            You're invited
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="onboard.invite">
            Join <span className="text-foreground font-medium">{info.organizationName}</span> for{" "}
            {info.eventName}
            {info.inviterName ? `, invited by ${info.inviterName}` : ""}.
          </p>
        </div>

        {detectedAccount ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="default"
              onClick={handlePasskey}
              disabled={passkeyPending || nearPending}
              className="w-full"
              data-testid="onboard.passkey-button"
            >
              {passkeyPending ? "waiting for passkey..." : "Create your account"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleNear}
              disabled={passkeyPending || nearPending}
              className="w-full"
              data-testid="onboard.signin-button"
            >
              {nearPending ? "connecting..." : `Continue as ${detectedAccount}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                setNearPending(true);
                try {
                  await auth.near.disconnect();
                  await handleNear();
                } catch {
                  setNearPending(false);
                  toast.error("Failed to disconnect wallet");
                }
              }}
              disabled={nearPending}
            >
              Use another wallet
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              type="button"
              variant="default"
              onClick={handlePasskey}
              disabled={passkeyPending || nearPending}
              className="w-full"
              data-testid="onboard.passkey-button"
            >
              {passkeyPending ? "waiting for passkey..." : "Create your account"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleNear}
              disabled={passkeyPending || nearPending}
              className="w-full"
              data-testid="onboard.signin-button"
            >
              {nearPending ? "connecting..." : "sign in with a NEAR wallet"}
            </Button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          New here? Creating an account uses your device passkey — no seed phrase.
        </p>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  description,
  testId,
}: {
  title: string;
  description: string;
  testId: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5 text-center">
        <h1 className="text-xl font-semibold text-foreground" data-testid="onboard.heading">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground" data-testid={testId}>
          {description}
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void navigate({ to: "/" })}
        >
          Back to home
        </Button>
      </div>
    </div>
  );
}

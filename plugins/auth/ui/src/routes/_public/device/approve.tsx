import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SearchParams = {
  user_code?: string;
};

function sanitizeUserCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/-/g, "").toUpperCase();
  return /^[A-Z2-9]{4,12}$/.test(cleaned) ? cleaned : undefined;
}

export const Route = createFileRoute("/_public/device/approve")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    user_code: sanitizeUserCode(search.user_code),
  }),
  component: DeviceApprovePage,
});

function DeviceApprovePage() {
  const navigate = useNavigate();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth, undefined));
  const { user_code } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session?.user) {
    return <NavigateToLogin userCode={user_code} />;
  }

  const handleApprove = async () => {
    if (!user_code) return;
    setPending(true);
    setError(null);
    const { error: approveError } = await auth.device.approve({ userCode: user_code });
    setPending(false);
    if (approveError) {
      setError("Could not approve this code. It may have expired or been claimed elsewhere.");
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

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-6 sm:p-8 space-y-5">
        <div className="space-y-1 text-center">
          <h1
            className="text-xl font-semibold text-foreground"
            data-testid="device.approve-heading"
          >
            Approve device
          </h1>
          <p className="text-sm text-muted-foreground">
            Approving will sign in this account on the other device.
          </p>
        </div>

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
              {pending ? "working…" : "Approve"}
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
  const target = userCode ? `/device/approve?user_code=${userCode}` : "/device/approve";
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

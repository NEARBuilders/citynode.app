import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getDeviceLinkClientId, refreshSessionCache, useAuthClient } from "everything-dev/ui/auth";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getActiveRuntime, getAppName } from "@/app";
import { Button } from "@/components/ui/button";
import { pluginHref } from "@/lib/plugin-path";

const DEVICE_LINK_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceLink = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  intervalMs: number;
};

type TokenError = { error?: string; code?: string } | null;

export const Route = createFileRoute("/_public/")({
  component: LandingPage,
});

function LandingPage() {
  const runtime = getActiveRuntime();
  const title = getAppName();

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <h1
            className="text-3xl font-semibold tracking-tight text-foreground"
            data-testid="landing.heading"
          >
            {title}
          </h1>
          <p className="text-muted-foreground">
            {runtime?.description ??
              "Spawn your own deployment: link your phone, sign in with a passkey, code locally."}
          </p>
        </div>
        <PairPanel redirect="/spawn" />
        <div className="text-sm text-muted-foreground">
          Or{" "}
          <a
            href={pluginHref("/login", { redirect: "/spawn" })}
            className="underline underline-offset-4 hover:text-foreground"
            data-testid="landing.signin-link"
          >
            sign in directly
          </a>
          .
        </div>
      </div>
    </div>
  );
}

function PairPanel({ redirect }: { redirect: string }) {
  const auth = useAuthClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const canceledRef = useRef(false);

  useEffect(() => {
    canceledRef.current = false;
    let active = true;
    void auth.device
      .code({ client_id: getDeviceLinkClientId() })
      .then(({ data, error }: { data: Record<string, unknown> | null; error: unknown }) => {
        if (!active) return;
        if (error || !data) {
          setFailed("Could not start device pairing");
          return;
        }
        const record = data as {
          device_code: string;
          user_code: string;
          verification_uri: string;
          verification_uri_complete?: string;
          interval?: number;
        };
        const complete = record.verification_uri_complete ?? record.verification_uri;
        const uri = complete.startsWith("http") ? complete : `${window.location.origin}${complete}`;
        setLink({
          deviceCode: record.device_code,
          userCode: record.user_code,
          verificationUriComplete: uri,
          intervalMs: (record.interval ?? 5) * 1000,
        });
        void QRCode.toDataURL(uri, { width: 220, margin: 1 }).then((url) => {
          if (active) setQrDataUrl(url);
        });
      });
    return () => {
      active = false;
      canceledRef.current = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!link || claimed || canceledRef.current) return;
    let timer: number | undefined;
    let intervalMs = link.intervalMs;
    const poll = async () => {
      if (canceledRef.current) return;
      const { data, error } = await auth.device.token({
        grant_type: DEVICE_LINK_GRANT_TYPE,
        device_code: link.deviceCode,
        client_id: getDeviceLinkClientId(),
      });
      if (canceledRef.current) return;
      const token = (data as { access_token?: string } | null)?.access_token;
      if (token) {
        setClaimed(true);
        const claim = await auth.$fetch("/device-link/claim", {
          method: "POST",
          body: { token },
        });
        if (claim.error) {
          setFailed("Failed to complete sign-in");
          return;
        }
        await refreshSessionCache(auth, queryClient);
        toast.success("Signed in");
        await navigate({ to: redirect, replace: true });
        return;
      }
      const err = (error as TokenError)?.error;
      if (err === "expired_token") {
        setFailed("This code expired. Reload to get a new one.");
        return;
      }
      if (err === "access_denied") {
        setFailed("Sign-in was denied on your phone.");
        return;
      }
      if (err === "slow_down") {
        intervalMs += 5000;
      }
      timer = window.setTimeout(poll, intervalMs);
    };
    timer = window.setTimeout(poll, intervalMs);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      canceledRef.current = true;
    };
  }, [link, claimed, auth, navigate, queryClient, redirect]);

  if (failed) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-6 space-y-3"
        data-testid="pair.failed"
      >
        <p className="text-sm text-destructive">{failed}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  if (claimed) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
        data-testid="pair.claimed"
      >
        Signing you in…
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4"
      data-testid="pair.panel"
    >
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt="Scan to sign in"
          className="mx-auto rounded-lg border border-border"
          data-testid="pair.qr"
        />
      ) : (
        <div className="h-[220px] w-[220px] mx-auto rounded-lg bg-muted animate-pulse" />
      )}
      <div className="space-y-1">
        <p className="text-sm text-foreground">Scan with your phone</p>
        <p className="text-sm text-muted-foreground">
          Authenticate with a passkey on your phone — this desktop signs in as the same identity and
          gets a NEAR account.
        </p>
        {link?.userCode ? (
          <p className="text-xs text-muted-foreground">
            or visit{" "}
            <a href={link.verificationUriComplete} className="underline underline-offset-4">
              {link.verificationUriComplete}
            </a>{" "}
            · code <span className="font-mono text-foreground">{link.userCode}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

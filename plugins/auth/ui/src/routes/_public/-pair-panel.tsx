import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getDeviceLinkClientId, refreshSessionCache, useAuthClient } from "everything-dev/ui/auth";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LoginMessageId } from "@/i18n/catalogs";
import { useLoginTranslation } from "@/i18n/runtime";

const DEVICE_LINK_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceLink = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  intervalMs: number;
};

type TokenError = { error?: string; code?: string } | null;

export function PairPanel({ redirect, onClose }: { redirect: string; onClose: () => void }) {
  const auth = useAuthClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useLoginTranslation();
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<LoginMessageId | null>(null);
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
          setFailed("auth.login.pair.startFailed");
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
          setFailed("auth.login.pair.completeFailed");
          return;
        }
        await refreshSessionCache(auth, queryClient);
        toast.success(t("auth.login.pair.success"));
        await navigate({ to: redirect, replace: true });
        return;
      }
      const err = (error as TokenError)?.error;
      if (err === "expired_token") {
        setFailed("auth.login.pair.expired");
        return;
      }
      if (err === "access_denied") {
        setFailed("auth.login.pair.denied");
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
    };
  }, [auth, link, claimed, navigate, queryClient, redirect, t]);

  return (
    <div className="space-y-4 text-center">
      <div
        className="mx-auto w-fit rounded-lg border border-border bg-card p-4"
        data-testid="device.qr"
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={t("auth.login.pair.imageAlt")} className="size-[220px]" />
        ) : (
          <div className="size-[220px] animate-pulse rounded bg-muted" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("auth.login.pair.instructions")}</p>
      <p
        className="font-mono text-lg tracking-widest text-foreground"
        data-testid="device.user-code"
      >
        {link?.userCode ?? "····-····"}
      </p>
      <p className="text-sm text-muted-foreground" data-testid="device.status">
        {claimed ? t("auth.login.pair.signingIn") : t("auth.login.pair.waiting")}
      </p>
      {failed && (
        <p className="text-sm text-destructive" data-testid="device.error">
          {t(failed)}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClose}
        data-testid="device.cancel-button"
      >
        {t("auth.login.pair.cancel")}
      </Button>
    </div>
  );
}

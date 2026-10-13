import { ArrowClockwiseIcon, ArrowLeftIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getDeviceLinkClientId, refreshSessionCache, useAuthClient } from "everything-dev/ui/auth";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { LoginMessageId } from "@/i18n/catalogs";
import { useLoginTranslation } from "@/i18n/runtime";
import { offerPasskeyOnThisDevice } from "@/lib/passkey-offer";

const DEVICE_LINK_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceLink = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  intervalMs: number;
};

type TokenError = { error?: string; code?: string } | null;

function parseDeviceLink(data: unknown): DeviceLink | null {
  if (!data || typeof data !== "object") return null;
  const deviceCode = Reflect.get(data, "device_code");
  const userCode = Reflect.get(data, "user_code");
  const verificationUriComplete = Reflect.get(data, "verification_uri_complete");
  const interval = Reflect.get(data, "interval");
  if (
    typeof deviceCode !== "string" ||
    typeof userCode !== "string" ||
    typeof verificationUriComplete !== "string" ||
    typeof interval !== "number"
  ) {
    return null;
  }
  return { deviceCode, userCode, verificationUriComplete, intervalMs: interval * 1000 };
}

export function PairPanel({ redirect, onClose }: { redirect: string; onClose: () => void }) {
  const auth = useAuthClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useLoginTranslation();
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<LoginMessageId | null>(null);
  const [claimed, setClaimed] = useState(false);
  const canceledRef = useRef(false);

  useEffect(() => {
    canceledRef.current = false;
    let active = true;
    const start = async () => {
      const { data, error } = await auth.device.code({ client_id: getDeviceLinkClientId() });
      const next = error ? null : parseDeviceLink(data);
      if (!next) throw new Error("Device pairing did not start");
      const url = await QRCode.toDataURL(next.verificationUriComplete, { width: 220, margin: 1 });
      if (!active) return;
      setLink(next);
      setQrDataUrl(url);
    };
    start().catch(() => {
      if (active) setFailed("auth.login.pair.startFailed");
    });
    return () => {
      active = false;
      canceledRef.current = true;
    };
  }, [auth, attempt]);

  useEffect(() => {
    if (!link || claimed || failed || canceledRef.current) return;
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
          body: { token, client_id: getDeviceLinkClientId() },
        });
        if (claim.error) {
          setFailed("auth.login.pair.completeFailed");
          return;
        }
        await refreshSessionCache(auth, queryClient);
        toast.success(t("auth.login.pair.success"));
        await navigate({ href: redirect, replace: true });
        offerPasskeyOnThisDevice(auth);
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
      timer = window.setTimeout(schedulePoll, intervalMs);
    };
    const schedulePoll = () => {
      poll().catch(() => {
        if (!canceledRef.current) setFailed("auth.login.pair.completeFailed");
      });
    };
    timer = window.setTimeout(schedulePoll, intervalMs);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [auth, link, claimed, failed, navigate, queryClient, redirect, t]);

  const restart = () => {
    setLink(null);
    setQrDataUrl(null);
    setClaimed(false);
    setFailed(null);
    setAttempt((value) => value + 1);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="rounded-3xl border border-border bg-card p-4" data-testid="device-qr">
        {failed ? (
          <div
            className="flex size-56 items-center justify-center text-muted-foreground"
            data-testid="device-qr-failed"
          >
            <WarningCircleIcon size={48} />
          </div>
        ) : qrDataUrl ? (
          <img src={qrDataUrl} alt={t("auth.login.pair.imageAlt")} className="size-56" />
        ) : (
          <Skeleton className="size-56" />
        )}
      </div>
      {!failed && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-muted-foreground">{t("auth.login.pair.instructions")}</span>
          <span
            className="font-mono text-2xl font-semibold tracking-widest text-foreground"
            data-testid="device-user-code"
          >
            {link?.userCode ?? "········"}
          </span>
        </div>
      )}
      {failed ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-sm text-destructive" data-testid="device-error">
            {t(failed)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={restart}
            data-testid="device-retry-button"
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            {t("auth.common.retry")}
          </Button>
        </div>
      ) : (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="device-status"
        >
          <Spinner />
          {claimed ? t("auth.login.pair.signingIn") : t("auth.login.pair.waiting")}
        </p>
      )}
      <Button type="button" variant="ghost" onClick={onClose} data-testid="device-cancel-button">
        <ArrowLeftIcon data-icon="inline-start" />
        {t("auth.login.pair.cancel")}
      </Button>
    </div>
  );
}

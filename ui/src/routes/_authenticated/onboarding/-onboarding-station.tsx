import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { ApiClient } from "@/app";
import { onboardingUrl } from "@/lib/gateway-origin";
import { formatRemaining } from "@/lib/onboarding-codes";

const RECENT_JOINERS = 6;

export function OnboardingStation({
  apiClient,
  codeId,
  organizationId,
  gatewayOrigin,
}: {
  apiClient: ApiClient;
  codeId: string;
  organizationId?: string;
  gatewayOrigin: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const station = useQuery({
    queryKey: ["onboarding-station", codeId, organizationId],
    queryFn: () => apiClient.auth.getOnboardingStation({ codeId, organizationId }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const status = useQuery({
    queryKey: ["onboarding-station-status", codeId, organizationId],
    queryFn: () => apiClient.auth.getOnboardingStatus({ codeId, organizationId }),
    enabled: station.isSuccess,
    refetchInterval: 2_000,
  });

  const code = station.data?.code;
  useEffect(() => {
    if (!code) return;
    let active = true;
    void QRCode.toDataURL(onboardingUrl(gatewayOrigin, code), { width: 720, margin: 1 }).then(
      (dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      },
    );
    return () => {
      active = false;
    };
  }, [code, gatewayOrigin]);

  if (station.isError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <p
          className="max-w-md text-center text-lg text-muted-foreground"
          data-testid="station.unavailable"
        >
          {station.error.message || "This onboarding station is unavailable."}
        </p>
      </div>
    );
  }

  if (!station.data) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <p className="text-sm text-muted-foreground" data-testid="station.loading">
          Opening station…
        </p>
      </div>
    );
  }

  const usedCount = status.data?.usedCount ?? station.data.usedCount;
  const joiners = (status.data?.joined ?? []).slice(0, RECENT_JOINERS);
  const gatewayHost = new URL(gatewayOrigin).host;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10 lg:flex-row lg:gap-16">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`Scan to join ${station.data.eventName}`}
            className="aspect-square w-full"
            data-testid="station.qr"
          />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
        )}
      </div>
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Scan to join
          </p>
          <h1 className="text-4xl font-semibold tracking-tight" data-testid="station.event-name">
            {station.data.eventName}
          </h1>
          <p className="text-muted-foreground">
            Open your phone camera and scan the code, or visit{" "}
            <span className="font-mono text-foreground">{gatewayHost}/onboard</span>.
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-semibold tabular-nums" data-testid="station.joined-count">
            {usedCount} joined
          </span>
          <span className="text-sm text-muted-foreground">
            of {station.data.maxUses} · {formatRemaining(station.data.expiresAt)} left
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Just joined</p>
          {joiners.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="station.recent-joiners">
              {joiners.map((entry) => (
                <li key={entry.userId} className="truncate text-lg text-foreground">
                  {entry.userName ?? "New member"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-muted-foreground">Waiting for the first scan…</p>
          )}
        </div>
      </div>
    </div>
  );
}

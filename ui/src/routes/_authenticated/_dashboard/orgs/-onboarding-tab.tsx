import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ApiClient } from "@/app";
import { Badge, Button, Card, Input, TabsContent } from "@/components";

type OnboardingCodeSummary = Awaited<ReturnType<ApiClient["auth"]["listOnboardingCodes"]>>[number];
type OnboardingStatus = Awaited<ReturnType<ApiClient["auth"]["getOnboardingStatus"]>>;
type CreatedOnboardingCode = OnboardingCodeSummary & { code: string };

const orgOnboardingQueryKey = (orgId: string) => ["org-onboarding", orgId] as const;
const orgOnboardingStatusQueryKey = (codeId: string) => ["org-onboarding-status", codeId] as const;

function formatRemaining(expiresAt: Date): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function OnboardingTab({
  apiClient,
  canManage,
  orgId,
}: {
  apiClient: ApiClient;
  canManage: boolean;
  orgId: string;
}) {
  const queryClient = useQueryClient();
  const [eventName, setEventName] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [created, setCreated] = useState<CreatedOnboardingCode | null>(null);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const codes =
    useQuery({
      queryKey: orgOnboardingQueryKey(orgId),
      queryFn: async (): Promise<OnboardingCodeSummary[]> => {
        return apiClient.auth.listOnboardingCodes({ organizationId: orgId });
      },
      enabled: !!orgId && canManage,
      refetchInterval: 10_000,
    }).data ?? [];

  const status = useQuery({
    queryKey: orgOnboardingStatusQueryKey(selectedCodeId ?? ""),
    queryFn: async (): Promise<OnboardingStatus> => {
      return apiClient.auth.getOnboardingStatus({
        codeId: selectedCodeId!,
        organizationId: orgId,
      });
    },
    enabled: !!selectedCodeId && canManage,
    refetchInterval: 2_000,
  }).data;

  useEffect(() => {
    if (!created) return;
    let active = true;
    const url = `${window.location.origin}/onboard?code=${encodeURIComponent(created.code)}`;
    void QRCode.toDataURL(url, { width: 240, margin: 1 }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [created]);

  useEffect(() => {
    if (created) setSelectedCodeId(created.id);
  }, [created]);

  const createMutation = useMutation({
    mutationFn: async (): Promise<CreatedOnboardingCode> => {
      const parsedMaxUses = Number.parseInt(maxUses, 10);
      return apiClient.auth.createOnboardingCode({
        eventName: eventName.trim(),
        organizationId: orgId,
        ...(Number.isInteger(parsedMaxUses) && parsedMaxUses > 0 ? { maxUses: parsedMaxUses } : {}),
      });
    },
    onSuccess: (code) => {
      setEventName("");
      setMaxUses("");
      setCreated(code);
      toast.success(`Onboarding started for ${code.eventName}`);
      void queryClient.invalidateQueries({ queryKey: orgOnboardingQueryKey(orgId) });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start onboarding");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      return apiClient.auth.revokeOnboardingCode({ codeId, organizationId: orgId });
    },
    onSuccess: () => {
      toast.success("Onboarding code revoked");
      setCreated(null);
      void queryClient.invalidateQueries({ queryKey: orgOnboardingQueryKey(orgId) });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke");
    },
  });

  const activeStatus = status ?? null;
  const activeCode = codes.find((code) => code.id === selectedCodeId) ?? null;
  const expired = activeCode !== null && new Date(activeCode.expiresAt).getTime() < Date.now();

  return (
    <TabsContent value="onboard" className="space-y-6 pt-4">
      {canManage ? (
        <>
          <Card className="p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Onboarding station</h3>
              <p className="text-sm text-muted-foreground">
                People scan the QR with their phone to join this organization with a passkey wallet
                or an existing NEAR wallet.
              </p>
            </div>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (eventName.trim()) createMutation.mutate();
              }}
            >
              <div className="flex-1 space-y-1">
                <label className="text-sm text-muted-foreground" htmlFor="onboard-event-name">
                  Onboarding event
                </label>
                <Input
                  id="onboard-event-name"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="Launch night"
                  maxLength={64}
                  data-testid="onboard.event-name-input"
                />
              </div>
              <div className="w-full sm:w-32 space-y-1">
                <label className="text-sm text-muted-foreground" htmlFor="onboard-max-uses">
                  Max joins
                </label>
                <Input
                  id="onboard-max-uses"
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                  placeholder="50"
                  inputMode="numeric"
                  data-testid="onboard.max-uses-input"
                />
              </div>
              <Button
                type="submit"
                disabled={createMutation.isPending || !eventName.trim()}
                data-testid="onboard.start-button"
              >
                {createMutation.isPending ? "starting..." : "Start onboarding"}
              </Button>
            </form>
          </Card>

          {created && (
            <Card className="p-6 space-y-4" data-testid="onboard.station">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div
                  className="w-fit rounded-lg border border-border bg-card p-4"
                  data-testid="onboard.qr"
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`Scan to join ${created.eventName}`}
                      className="size-[240px]"
                    />
                  ) : (
                    <div className="size-[240px] animate-pulse rounded bg-muted" />
                  )}
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-foreground">{created.eventName}</h4>
                    <Badge variant="outline">station</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      className="min-w-0 truncate rounded border border-border bg-muted/40 px-2 py-1 font-mono text-xs"
                      data-testid="onboard.code"
                    >
                      {created.code}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(created.code);
                          toast.success("Code copied");
                        } catch {
                          toast.error("Failed to copy code");
                        }
                      }}
                      data-testid="onboard.copy-code-button"
                    >
                      Copy code
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    People scan the QR, or open{" "}
                    <span className="font-mono text-foreground">/onboard?code=…</span> and enter
                    this code.
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="onboard.joined-count">
                    {activeStatus
                      ? `${activeStatus.usedCount}/${activeStatus.maxUses} joined`
                      : "0 joined"}
                    {" · "}
                    {formatRemaining(created.expiresAt)} remaining
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (confirm("Revoke this onboarding code?"))
                        revokeMutation.mutate(created.id);
                    }}
                    disabled={revokeMutation.isPending}
                    data-testid="onboard.revoke-button"
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeStatus && (
            <Card className="p-6 space-y-4" data-testid="onboard.status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-foreground">
                  Live status{activeCode ? ` — ${activeCode.eventName}` : ""}
                </h4>
                <span className="text-sm text-muted-foreground">
                  {activeStatus.usedCount}/{activeStatus.maxUses} joined ·{" "}
                  {formatRemaining(activeStatus.expiresAt)} remaining
                </span>
              </div>
              {activeStatus.joined.length > 0 ? (
                <ul className="divide-y divide-border" data-testid="onboard.joined-list">
                  {activeStatus.joined.map((entry) => (
                    <li key={entry.userId} className="flex items-center justify-between py-2 gap-2">
                      <span className="text-sm text-foreground truncate">
                        {entry.userName ?? "New member"}
                      </span>
                      <span className="text-xs text-muted-foreground truncate font-mono">
                        {entry.accountId ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for the first scan…</p>
              )}
            </Card>
          )}

          {codes.length > 0 && (
            <Card className="p-6 space-y-3">
              <h4 className="text-base font-semibold text-foreground">Onboarding events</h4>
              <ul className="divide-y divide-border">
                {codes.map((code) => {
                  const codeExpired = new Date(code.expiresAt).getTime() < Date.now();
                  const state = code.revokedAt
                    ? "revoked"
                    : codeExpired
                      ? "expired"
                      : `${code.usedCount}/${code.maxUses}`;
                  return (
                    <li key={code.id} className="flex items-center justify-between py-2 gap-2">
                      <button
                        type="button"
                        className="text-sm text-foreground truncate text-left hover:underline"
                        onClick={() => {
                          setCreated(null);
                          setSelectedCodeId(code.id);
                        }}
                        data-testid={`onboard.code-${code.id}`}
                      >
                        {code.eventName}
                      </button>
                      <span className="text-xs text-muted-foreground shrink-0">{state}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only organization owners and admins can run onboarding.
        </p>
      )}
      {expired && (
        <p className="text-sm text-destructive" data-testid="onboard.expired">
          This onboarding code has expired.
        </p>
      )}
    </TabsContent>
  );
}

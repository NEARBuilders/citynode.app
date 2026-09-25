import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type { ApiClient } from "@/app";
import { Button, Card, TabsContent } from "@/components";
import { formatRemaining, onboardingCodeState } from "@/lib/onboarding-codes";

type OnboardingCodeSummary = Awaited<ReturnType<ApiClient["auth"]["listOnboardingCodes"]>>[number];
type OnboardingStatus = Awaited<ReturnType<ApiClient["auth"]["getOnboardingStatus"]>>;

const orgOnboardingQueryKey = (orgId: string) => ["org-onboarding", orgId] as const;
const orgOnboardingStatusQueryKey = (codeId: string) => ["org-onboarding-status", codeId] as const;

function stateLabel(code: OnboardingCodeSummary): string {
  const state = onboardingCodeState(code);
  if (state === "used-up") return "used up";
  if (state === "active") return `${code.usedCount}/${code.maxUses} joined`;
  return state;
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
  const location = useLocation();
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);

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

  const revokeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      return apiClient.auth.revokeOnboardingCode({ codeId, organizationId: orgId });
    },
    onSuccess: () => {
      toast.success("Onboarding code revoked");
      void queryClient.invalidateQueries({ queryKey: orgOnboardingQueryKey(orgId) });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke");
    },
  });

  const selectedCode = codes.find((code) => code.id === selectedCodeId) ?? null;
  const activeStatus = status && selectedCode ? status : null;

  return (
    <TabsContent value="onboard" className="space-y-6 pt-4">
      {canManage ? (
        <>
          <Card className="p-6 space-y-2">
            <h3 className="text-base font-semibold text-foreground">Onboarding stations</h3>
            <p className="text-sm text-muted-foreground" data-testid="onboard.start-from-event">
              Start onboarding from an event: open your community editor, find the event under
              Events & updates, and choose Start onboarding. Attendees who scan its QR join this
              organization and the event's team.
            </p>
          </Card>

          {activeStatus && selectedCode && (
            <Card className="p-6 space-y-4" data-testid="onboard.status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-foreground">
                  Live status — {selectedCode.eventName}
                </h4>
                <span className="text-sm text-muted-foreground" data-testid="onboard.joined-count">
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
              {onboardingCodeState(selectedCode) === "active" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (confirm("Revoke this onboarding code?"))
                      revokeMutation.mutate(selectedCode.id);
                  }}
                  disabled={revokeMutation.isPending}
                  data-testid="onboard.revoke-button"
                >
                  Revoke
                </Button>
              )}
            </Card>
          )}

          {codes.length > 0 && (
            <Card className="p-6 space-y-3">
              <h4 className="text-base font-semibold text-foreground">Recent codes</h4>
              <ul className="divide-y divide-border">
                {codes.map((code) => (
                  <li key={code.id} className="flex items-center justify-between py-2 gap-2">
                    <button
                      type="button"
                      className="text-sm text-foreground truncate text-left hover:underline"
                      onClick={() => setSelectedCodeId(code.id)}
                      data-testid={`onboard.code-${code.id}`}
                    >
                      {code.eventName}
                    </button>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid={`onboard.code-state-${code.id}`}
                      >
                        {stateLabel(code)}
                      </span>
                      {onboardingCodeState(code) === "active" && (
                        <Link
                          to="/onboarding/station/$codeId"
                          params={{ codeId: code.id }}
                          search={{ org: orgId, from: location.href }}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                          data-testid={`onboard.open-station-${code.id}`}
                        >
                          Open station
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only organizers can run onboarding: organization owners, admins, and members of a team
          with the Events area.
        </p>
      )}
    </TabsContent>
  );
}

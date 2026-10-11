import { QrCodeIcon } from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type { ApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  formatLocalDate,
  LocalDate,
  SectionHeader,
  Skeleton,
  TabsContent,
} from "@/components";
import { activitiesQueryOptions } from "@/components/discovery/activity-form";
import { upcomingEvents, useStartOnboarding } from "@/components/discovery/event-onboarding";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { translateEnglishAppMessage, useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { formatRemaining, onboardingCodeState } from "@/lib/onboarding-codes";
import { tenantNodesQueryOptions } from "@/lib/queries/nodes";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";

type OnboardingCodeSummary = Awaited<ReturnType<ApiClient["auth"]["listOnboardingCodes"]>>[number];
type OnboardingStatus = Awaited<ReturnType<ApiClient["auth"]["getOnboardingStatus"]>>;

const orgOnboardingQueryKey = (orgId: string) => ["org-onboarding", orgId] as const;
const orgOnboardingStatusQueryKey = (codeId: string) => ["org-onboarding-status", codeId] as const;

const STATE_BADGE = {
  active: "success",
  expired: "outline",
  revoked: "outline",
  "used-up": "secondary",
} as const;

function stateLabel(
  code: OnboardingCodeSummary,
  t: AppTranslator = translateEnglishAppMessage,
): string {
  const state = onboardingCodeState(code);
  if (state === "used-up") return t("station.usedUp");
  if (state === "active")
    return t("station.joinedShort", { used: code.usedCount, max: code.maxUses });
  return state === "expired" ? t("station.expired") : t("station.revoked");
}

function StartStation({
  apiClient,
  orgId,
  isActive,
}: {
  apiClient: ApiClient;
  orgId: string;
  isActive: boolean;
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const [eventId, setEventId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const start = useStartOnboarding(orgId);
  const tenant = useQuery({ ...tenantByOrgQueryOptions(apiClient, orgId), enabled: isActive });
  const tenantId = tenant.data?.id ?? "";
  const nodes = useQuery({ ...tenantNodesQueryOptions(apiClient, tenantId), enabled: !!tenantId });
  const activities = useQueries({
    queries: (nodes.data ?? []).map((node) => activitiesQueryOptions(apiClient, node.id)),
    combine: (results) => ({
      data: results.flatMap((result) => result.data ?? []),
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });

  if (!isActive) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="onboard.switch-to-start">
        {translate("org.switchToStartStation")}
      </p>
    );
  }
  if (tenant.isPending || nodes.isLoading || activities.isPending) {
    return <Skeleton className="h-10 w-full max-w-md" />;
  }
  if (nodes.isError || activities.isError) {
    return (
      <p role="alert" className="text-sm text-muted-foreground" data-testid="onboard.events-error">
        {translate("station.eventLoadError")}
      </p>
    );
  }
  const firstNodeId = nodes.data?.[0]?.id;
  if (!tenant.data || !firstNodeId) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="onboard.no-community">
        {translate("org.noCommunityEvents")}
      </p>
    );
  }
  const events = upcomingEvents(activities.data, now);
  if (events.length === 0) {
    return (
      <EmptyState
        icon={QrCodeIcon}
        title={translate("station.noEvents")}
        description={translate("station.addEventHint")}
        className="py-10"
        action={
          <Button
            nativeButton={false}
            render={
              <Link
                to="/nodes/$nodeId/content"
                params={{ nodeId: firstNodeId }}
                search={{ tab: "events" }}
              />
            }
            data-testid="onboard.add-event"
          >
            {translate("station.addEvent")}
          </Button>
        }
      />
    );
  }
  const selected = events.find((event) => event.id === eventId) ?? null;
  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      data-testid="onboard.event-picker"
    >
      <Field className="min-w-0 sm:w-96">
        <FieldLabel htmlFor="onboard-event">{translate("org.pickEvent")}</FieldLabel>
        <Select
          value={selected?.id ?? null}
          items={events.map((event) => ({
            label: event.startsAt
              ? `${event.title} · ${formatLocalDate(event.startsAt, "date", locale)}`
              : event.title,
            value: event.id,
          }))}
          onValueChange={(value) => setEventId(typeof value === "string" ? value : null)}
        >
          <SelectTrigger id="onboard-event" className="w-full" data-testid="onboard.event-select">
            <SelectValue placeholder={translate("org.pickEventPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem
                key={event.id}
                value={event.id}
                data-testid={`onboard.event-option-${event.id}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {event.title}
                    {event.status === "draft" ? ` · ${translate("events.draft")}` : ""}
                  </span>
                  {event.startsAt && (
                    <span className="text-xs text-muted-foreground">
                      <LocalDate value={event.startsAt} format="datetime" />
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button
        disabled={!selected || start.isPending}
        onClick={() => selected && start.mutate({ eventId: selected.id })}
        data-testid="onboard.start-station"
      >
        <QrCodeIcon />
        {translate("events.startOnboarding")}
      </Button>
    </div>
  );
}

export function OnboardingTab({
  apiClient,
  orgId,
  isActive,
}: {
  apiClient: ApiClient;
  orgId: string;
  isActive: boolean;
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const codes =
    useQuery({
      queryKey: orgOnboardingQueryKey(orgId),
      queryFn: async (): Promise<OnboardingCodeSummary[]> => {
        return apiClient.auth.listOnboardingCodes({ organizationId: orgId });
      },
      enabled: !!orgId,
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
    enabled: !!selectedCodeId,
    refetchInterval: 2_000,
  }).data;

  const revokeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      return apiClient.auth.revokeOnboardingCode({ codeId, organizationId: orgId });
    },
    onSuccess: () => {
      toast.success(translate("org.codeRevoked"));
      void queryClient.invalidateQueries({ queryKey: orgOnboardingQueryKey(orgId) });
    },
    onError: (error) => {
      toast.error(appErrorMessage(error, translate));
    },
  });

  const selectedCode = codes.find((code) => code.id === selectedCodeId) ?? null;
  const activeStatus = status && selectedCode ? status : null;

  return (
    <TabsContent value="onboard" className="flex flex-col gap-6 pt-6">
      <SectionHeader
        title={translate("org.stations")}
        description={
          <span data-testid="onboard.start-from-event">{translate("org.stationsDescription")}</span>
        }
      />
      <StartStation apiClient={apiClient} orgId={orgId} isActive={isActive} />

      {activeStatus && selectedCode && (
        <Card data-testid="onboard.status">
          <CardContent className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-lg font-medium text-foreground">{selectedCode.eventName}</h3>
                <span className="text-sm text-muted-foreground">
                  {formatRemaining(activeStatus.expiresAt, Date.now(), translate, locale)}
                  {translate("station.remaining")}
                </span>
              </div>
              <div className="flex flex-col items-end" data-testid="onboard.joined-count">
                <span className="text-4xl font-semibold text-foreground tabular-nums">
                  {activeStatus.usedCount}
                  <span className="text-xl text-muted-foreground">/{activeStatus.maxUses}</span>
                </span>
                <span className="text-sm text-muted-foreground">{translate("station.joined")}</span>
              </div>
            </div>
            {activeStatus.joined.length > 0 ? (
              <ul
                className="flex flex-col divide-y divide-border"
                data-testid="onboard.joined-list"
              >
                {activeStatus.joined.map((entry) => (
                  <li key={entry.userId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {entry.userName ?? translate("org.newMember")}
                    </span>
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {entry.accountId ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{translate("org.waitingScan")}</p>
            )}
            {onboardingCodeState(selectedCode) === "active" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to="/onboarding/station/$codeId"
                      params={{ codeId: selectedCode.id }}
                      search={{ org: orgId, from: location.href }}
                    />
                  }
                >
                  {translate("org.openStation")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevoking(selectedCode.id)}
                  disabled={revokeMutation.isPending}
                  data-testid="onboard.revoke-button"
                >
                  {translate("org.revoke")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {codes.length > 0 ? (
        <ItemGroup>
          {codes.map((code, index) => {
            const state = onboardingCodeState(code);
            return (
              <div key={code.id} className="flex flex-col">
                {index > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemMedia variant="icon">
                    <QrCodeIcon />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="min-w-0 max-w-full justify-start"
                        onClick={() => setSelectedCodeId(code.id)}
                        data-testid={`onboard.code-${code.id}`}
                      >
                        <span className="min-w-0 truncate">{code.eventName}</span>
                      </Button>
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Badge
                      variant={STATE_BADGE[state]}
                      data-testid={`onboard.code-state-${code.id}`}
                    >
                      {stateLabel(code, translate)}
                    </Badge>
                    {state === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            to="/onboarding/station/$codeId"
                            params={{ codeId: code.id }}
                            search={{ org: orgId, from: location.href }}
                            data-testid={`onboard.open-station-${code.id}`}
                          />
                        }
                      >
                        {translate("org.openStation")}
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              </div>
            );
          })}
        </ItemGroup>
      ) : (
        <EmptyState
          icon={QrCodeIcon}
          title={translate("org.noStations")}
          description={translate("org.noStationsDescription")}
          className="py-10"
        />
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={translate("org.revokeStationTitle")}
        description={translate("org.revokeStationDescription")}
        confirmLabel={translate("org.revoke")}
        variant="destructive"
        isPending={revokeMutation.isPending}
        onConfirm={() => {
          if (revoking) revokeMutation.mutate(revoking);
          setRevoking(null);
        }}
      />
    </TabsContent>
  );
}

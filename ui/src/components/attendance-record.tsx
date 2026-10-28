import { ORPCError } from "@orpc/client";
import { CalendarCheckIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button, SectionHeader, Skeleton } from "@/components";
import { LocalDate } from "@/components/local-date";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import {
  attendanceQueryKeys,
  attendanceReconcileQueryOptions,
  attendanceRecordQueryOptions,
} from "@/lib/queries/attendance";

type AttendanceRecordData = Awaited<ReturnType<ApiClient["getMyAttendance"]>>;
type Coverage = AttendanceRecordData["communities"][number];

const REASON_MESSAGES = {
  failed: "attendance.reasonFailed",
  not_synced: "attendance.reasonNotSynced",
  truncated: "attendance.reasonTruncated",
} as const;

export function AttendanceRecord({
  organizationId = null,
  reconcile = false,
  testId,
}: {
  organizationId?: string | null;
  reconcile?: boolean;
  testId: string;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const reconciled = useQuery({
    ...attendanceReconcileQueryOptions(apiClient, organizationId ?? ""),
    enabled: reconcile && !!organizationId,
  });
  const record = useQuery({
    ...attendanceRecordQueryOptions(apiClient, organizationId),
    enabled: !reconcile || !organizationId || reconciled.isFetched,
  });
  const queryClient = useQueryClient();
  const reconciledAt = reconciled.dataUpdatedAt;
  useEffect(() => {
    if (!reconciledAt) return;
    void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.records() });
  }, [queryClient, reconciledAt]);
  const everyCommunity = !organizationId;

  if (record.error instanceof ORPCError && record.error.code === "FORBIDDEN") return null;
  if (everyCommunity && record.isPending) return null;
  if (
    everyCommunity &&
    record.data &&
    record.data.communities.length === 0 &&
    record.data.events.length === 0 &&
    record.data.unclassified.length === 0
  ) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-6" data-testid={testId}>
      <SectionHeader
        title={translate("attendance.title")}
        description={translate(
          everyCommunity ? "attendance.descriptionEverywhere" : "attendance.description",
        )}
      />
      {record.isError ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
          role="alert"
          data-testid={`${testId}-error`}
        >
          <span>{translate("attendance.loadFailed")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void record.refetch()}
            data-testid={`${testId}-retry`}
          >
            {translate("common.retry")}
          </Button>
        </div>
      ) : !record.data ? (
        <div className="flex flex-col gap-3" data-testid={`${testId}-loading`}>
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {record.data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
              {translate("attendance.empty")}
            </p>
          ) : (
            <ItemGroup data-testid={`${testId}-events`}>
              {record.data.events.map((event) => (
                <Item
                  key={`${event.organizationId}:${event.eventId}`}
                  variant="outline"
                  data-testid={`${testId}-event`}
                >
                  <ItemMedia variant="icon">
                    <CalendarCheckIcon />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="break-words">{event.eventName}</ItemTitle>
                    <ItemDescription className="flex flex-col gap-0.5">
                      {everyCommunity && <span>{event.communityName}</span>}
                      <span>
                        {translate("attendance.checkedInOn")}{" "}
                        <LocalDate value={event.checkedInAt} format="datetime" />
                      </span>
                      {event.startsAt && (
                        <span>
                          {translate("attendance.eventDate")}{" "}
                          <LocalDate value={event.startsAt} format="date" />
                        </span>
                      )}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
          {record.data.unclassified.length > 0 && (
            <div className="flex flex-col gap-3" data-testid={`${testId}-unclassified`}>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{translate("attendance.otherTitle")}</h3>
                <p className="text-sm text-muted-foreground">{translate("attendance.otherHint")}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {record.data.unclassified.map((checkIn) => (
                  <li
                    key={`${checkIn.organizationId}:${checkIn.codeId}`}
                    className="min-w-0 break-words text-sm"
                    data-testid={`${testId}-unclassified-item`}
                  >
                    <span className="font-medium">{checkIn.eventName}</span>
                    <span className="text-muted-foreground">
                      {everyCommunity && ` · ${checkIn.communityName}`} ·{" "}
                      {translate("attendance.checkedInOn")}{" "}
                      <LocalDate value={checkIn.checkedInAt} format="datetime" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CoverageNotes
            communities={record.data.communities}
            named={everyCommunity}
            testId={`${testId}-coverage`}
          />
        </>
      )}
    </section>
  );
}

function CoverageNotes({
  communities,
  named,
  testId,
}: {
  communities: Coverage[];
  named: boolean;
  testId: string;
}) {
  const translate = useAppTranslation();
  if (communities.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground" data-testid={testId}>
      {communities.map((community) => (
        <li
          key={community.organizationId}
          className="min-w-0 break-words"
          data-testid={`${testId}-${community.status}`}
        >
          {named && (
            <span className="font-medium text-foreground">{community.communityName}: </span>
          )}
          {community.status === "incomplete" ? (
            <>
              <span className="font-medium text-foreground">
                {translate("attendance.incomplete")}
              </span>{" "}
              {community.reasons.map((reason) => translate(REASON_MESSAGES[reason])).join(" ")}
            </>
          ) : (
            <>
              {community.syncedAt && (
                <>
                  {translate("attendance.syncedUpTo")}{" "}
                  <LocalDate value={community.syncedAt} format="datetime" />.{" "}
                </>
              )}
              {translate("attendance.deletedTeamsHint")}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

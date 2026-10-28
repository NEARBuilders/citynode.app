import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Badge, Button, useLocalDate } from "@/components";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { returningMembersQueryOptions } from "@/lib/queries/returning-members";

export function ReturningMembers({
  organizationId,
  nodeIds,
}: {
  organizationId: string;
  nodeIds: readonly string[];
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const stat = useQuery(returningMembersQueryOptions(apiClient, organizationId, nodeIds));
  const readAt = useLocalDate(
    stat.data?.kind === "no-codes" ? null : stat.data?.readAt,
    "datetime",
  );

  if (stat.isError) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        role="alert"
        data-testid="dashboard-node.returning-members-error"
      >
        <span>{translate("dashboard.returningMembersFailed")}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={stat.isFetching}
          onClick={() => void stat.refetch()}
          data-testid="dashboard-node.returning-members-retry"
        >
          {translate("common.retry")}
        </Button>
      </div>
    );
  }

  if (stat.data?.kind === "no-codes") return null;

  const numbers = new Intl.NumberFormat(locale);
  const data = stat.data;

  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="dashboard-node.returning-members">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {translate("dashboard.returningMembers")}
        </span>
        {data?.mayBeIncomplete && (
          <Badge variant="warning" data-testid="dashboard-node.returning-members-incomplete">
            {translate("dashboard.returningMembersIncomplete")}
          </Badge>
        )}
      </div>
      {data?.kind === "ready" ? (
        <>
          <span
            className="text-3xl font-semibold tabular-nums"
            data-testid="dashboard-node.returning-members-share"
          >
            {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
              data.returning / data.total,
            )}
          </span>
          <span className="text-sm" data-testid="dashboard-node.returning-members-counts">
            {translate("dashboard.returningMembersCounts", {
              returning: numbers.format(data.returning),
              total: numbers.format(data.total),
            })}
          </span>
        </>
      ) : data?.kind === "no-check-ins" ? (
        <span className="text-sm" data-testid="dashboard-node.returning-members-empty">
          {translate("dashboard.returningMembersNone")}
        </span>
      ) : (
        <span className="text-3xl font-semibold tabular-nums">—</span>
      )}
      {data && (
        <span
          className="text-xs text-muted-foreground"
          data-testid="dashboard-node.returning-members-scope"
        >
          {translate("dashboard.returningMembersScope", { readAt })}
        </span>
      )}
    </div>
  );
}

import { useQueries } from "@tanstack/react-query";
import { cn } from "cn";
import { useMemo, useState } from "react";
import { useApiClient } from "@/app";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { onboardingJoinsQueryOptions, recentUtcMonths } from "@/lib/queries/onboarding-joins";
import { LoadError } from "./-admin-ui";
import {
  buildJoinTrend,
  type JoinMetric,
  type JoinsTenant,
  type JoinTrendSeries,
  type OrganizationJoins,
} from "./-community-joins";

const SERIES_COLORS = ["bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
const OTHER_COLOR = "bg-muted-foreground/40";
const PLOT_HEIGHT = 176;
const TREND_MONTHS = 6;

export function CommunityJoinTrend({ tenants }: { tenants: readonly JoinsTenant[] | undefined }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const months = recentUtcMonths(TREND_MONTHS);
  const monthQueries = useQueries({
    queries: months.map((month) => onboardingJoinsQueryOptions(apiClient, month)),
  });
  if (monthQueries.some((query) => query.isError)) {
    return (
      <LoadError
        message={translate("admin.redemptions.failed")}
        onRetry={() => {
          for (const query of monthQueries) if (query.isError) void query.refetch();
        }}
        testId="admin-joins-error"
      />
    );
  }
  if (!tenants || !monthQueries.every((query) => query.isSuccess)) {
    return <Skeleton className="h-64 w-full" />;
  }
  return (
    <CommunityJoinChart
      tenants={tenants}
      months={months.map((month, index) => ({ month, joins: monthQueries[index]?.data }))}
    />
  );
}

function seriesColor(series: JoinTrendSeries, index: number) {
  return series.other ? OTHER_COLOR : (SERIES_COLORS[index] ?? OTHER_COLOR);
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude * 2 >= value) ?? 10;
  return step * magnitude * 2;
}

function CommunityJoinChart({
  tenants,
  months,
}: {
  tenants: readonly JoinsTenant[];
  months: readonly { month: string; joins: OrganizationJoins | undefined }[];
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const [metric, setMetric] = useState<JoinMetric>("redeemed");
  const [active, setActive] = useState<string | null>(null);
  const trend = useMemo(() => buildJoinTrend(tenants, months, metric), [tenants, months, metric]);
  const max = niceMax(Math.max(0, ...trend.months.map((month) => month.total)));
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
  const seriesLabel = (series: JoinTrendSeries) =>
    series.other ? translate("admin.trend.other") : series.label;
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const empty = trend.months.every((month) => month.total === 0);

  return (
    <figure className="flex flex-col gap-4" data-testid="admin-joins-chart">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm text-muted-foreground">
          {translate(
            metric === "redeemed" ? "admin.trend.redeemedCaption" : "admin.trend.newCaption",
            { count: months.length },
          )}
        </figcaption>
        <ToggleGroup
          value={[metric]}
          onValueChange={(value) => {
            const next = value.find((entry) => entry !== metric);
            if (next === "redeemed" || next === "newMembers") setMetric(next);
          }}
          data-testid="admin-joins-chart-metric"
        >
          <ToggleGroupItem value="redeemed" size="sm">
            {translate("admin.trend.redeemed")}
          </ToggleGroupItem>
          <ToggleGroupItem value="newMembers" size="sm">
            {translate("admin.trend.newMembers")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {translate("admin.trend.empty")}
        </p>
      ) : (
        <>
          {trend.series.length > 1 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {trend.series.map((series, index) => (
                <li key={series.key} className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-sm", seriesColor(series, index))} />
                  {seriesLabel(series)}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3">
            <div
              className="relative w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
              style={{ height: PLOT_HEIGHT }}
              aria-hidden
            >
              {[max, max / 2, 0].map((tick, index) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2"
                  style={{ top: `${index * 50}%` }}
                >
                  {formatCount(tick)}
                </span>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                className="relative flex items-end gap-2 border-b border-border sm:gap-4"
                style={{ height: PLOT_HEIGHT }}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
                <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                {trend.months.map((month, monthIndex) => {
                  const isActive = active === month.month;
                  const tooltipSide =
                    monthIndex === 0
                      ? "left-0"
                      : monthIndex === trend.months.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2";
                  return (
                    <button
                      type="button"
                      key={month.month}
                      className="group relative flex h-full flex-1 cursor-default flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${monthLabel(month.month)}: ${trend.series
                        .filter((series) => month.values[series.key])
                        .map((series) => `${seriesLabel(series)} ${month.values[series.key]}`)
                        .join(", ")}`}
                      onMouseEnter={() => setActive(month.month)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(month.month)}
                      onBlur={() => setActive(null)}
                      data-testid={`admin-joins-chart-month-${month.month}`}
                    >
                      <div className="mx-auto flex w-full max-w-12 flex-col-reverse gap-0.5">
                        {trend.series.map((series, index) => {
                          const value = month.values[series.key] ?? 0;
                          if (!value) return null;
                          return (
                            <div
                              key={series.key}
                              className={cn(
                                "w-full last:rounded-t-sm",
                                seriesColor(series, index),
                                active && !isActive && "opacity-60",
                              )}
                              style={{ height: Math.max(2, (value / max) * PLOT_HEIGHT - 2) }}
                            />
                          );
                        })}
                      </div>
                      {isActive && month.total > 0 && (
                        <div
                          role="tooltip"
                          className={cn(
                            "absolute bottom-full z-10 mb-2 w-max min-w-40 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5",
                            tooltipSide,
                          )}
                        >
                          <p className="mb-1 font-medium">{monthLabel(month.month)}</p>
                          <ul className="flex flex-col gap-0.5">
                            {trend.series
                              .map((series, index) => ({ series, index }))
                              .filter(({ series }) => month.values[series.key])
                              .reverse()
                              .map(({ series, index }) => (
                                <li key={series.key} className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "size-2 shrink-0 rounded-sm",
                                      seriesColor(series, index),
                                    )}
                                  />
                                  <span className="flex-1 text-muted-foreground">
                                    {seriesLabel(series)}
                                  </span>
                                  <span className="tabular-nums">
                                    {formatCount(month.values[series.key] ?? 0)}
                                  </span>
                                </li>
                              ))}
                          </ul>
                          <p className="mt-1 flex justify-between border-t border-border pt-1">
                            <span className="text-muted-foreground">
                              {translate("admin.trend.total")}
                            </span>
                            <span className="tabular-nums" data-testid="admin-joins-chart-total">
                              {formatCount(month.total)}
                            </span>
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 sm:gap-4" aria-hidden>
                {trend.months.map((month) => (
                  <span
                    key={month.month}
                    className="flex-1 text-center text-xs text-muted-foreground"
                  >
                    {monthLabel(month.month)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </figure>
  );
}

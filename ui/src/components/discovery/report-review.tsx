import { CheckIcon, LinkIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import { getActiveRuntime, useApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { getGatewayOrigin } from "@/lib/gateway-origin";
import { engagementQueryKeys } from "@/lib/queries/engagement";
import { eventReportQueryKeys } from "@/lib/queries/event-reports";
import { monthlyReportQueryKeys } from "@/lib/queries/monthly-reports";

export type ReviewTarget =
  | { kind: "monthly"; nodeId: string; month: string }
  | { kind: "event"; activityId: string };

export function ReviewButton({
  target,
  reviewed,
  testId,
}: {
  target: ReviewTarget;
  reviewed: boolean;
  testId: string;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: () =>
      target.kind === "monthly"
        ? api.reviewMonthlyReport({
            nodeId: target.nodeId,
            month: target.month,
            reviewed: !reviewed,
          })
        : api.reviewEventReport({ activityId: target.activityId, reviewed: !reviewed }),
    onSuccess: async () => {
      toast.success(translate(reviewed ? "reports.review.unmarked" : "reports.review.marked"));
      await Promise.all(
        [monthlyReportQueryKeys.all, eventReportQueryKeys.all, engagementQueryKeys.events()].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <Button
      size="sm"
      variant={reviewed ? "ghost" : "outline"}
      disabled={review.isPending}
      onClick={() => review.mutate()}
      data-testid={testId}
    >
      {!reviewed && <CheckIcon />}
      {translate(reviewed ? "reports.review.unmark" : "reports.review.mark")}
    </Button>
  );
}

export function ReviewedBadge({ testId }: { testId?: string }) {
  const translate = useAppTranslation();
  return (
    <Badge variant="success" data-testid={testId}>
      {translate("report.status.reviewed")}
    </Badge>
  );
}

export function reportLink(gatewayOrigin: string, slug: string) {
  return `${gatewayOrigin}/report?community=${encodeURIComponent(slug)}`;
}

export function CopyReportLink({ slug, testId }: { slug: string; testId: string }) {
  const translate = useAppTranslation();
  const { runtimeConfig } = useRouteContext({ strict: false });
  return (
    <Button
      size="sm"
      variant="outline"
      data-testid={testId}
      onClick={async () => {
        const origin = getGatewayOrigin(getActiveRuntime(runtimeConfig)?.gatewayId);
        try {
          await navigator.clipboard.writeText(reportLink(origin, slug));
          toast.success(translate("reports.linkCopied"));
        } catch {
          toast.error(translate("reports.copyFailed"));
        }
      }}
    >
      <LinkIcon />
      {translate("reports.copyLink")}
    </Button>
  );
}

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import type { FeatureArea } from "@/lib/feature-areas";
import { teamJoinQueryKeys } from "@/lib/queries/team-join-requests";
import { teamWorkspaceQueryKey } from "@/lib/team-workspace";

type TeamJoinRequest = Awaited<ReturnType<ApiClient["getTeamJoinBoard"]>>["requests"][number];

export function decidedTeamRequests(requests: readonly TeamJoinRequest[] | undefined) {
  return (requests ?? []).filter(
    (request) =>
      request.isMine &&
      (request.status === "approved" || request.status === "declined") &&
      !request.dismissedAt,
  );
}

function newAreaLink(areas: readonly FeatureArea[], nodeId: string | null) {
  if (areas.includes("events") && nodeId) {
    return <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "events" }} />;
  }
  if (areas.includes("finance")) return <Link to="/dashboard/node" hash="payouts" />;
  if (areas.includes("stake") && !areas.includes("node-operations")) return <Link to="/stake" />;
  return <Link to="/dashboard/node" />;
}

export function TeamRequestUpdates({
  organizationId,
  nodeId,
  requests,
}: {
  organizationId: string;
  nodeId: string | null;
  requests: TeamJoinRequest[];
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: (requestId: string) => apiClient.dismissTeamJoinRequest({ requestId }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: teamJoinQueryKeys.organization(organizationId) }),
  });
  const approvedIds = requests
    .filter((request) => request.status === "approved")
    .map((request) => request.id)
    .join();
  useEffect(() => {
    if (!approvedIds) return;
    void queryClient.invalidateQueries({ queryKey: ["home-auth-context"] });
    void queryClient.invalidateQueries({ queryKey: teamWorkspaceQueryKey });
  }, [approvedIds, queryClient]);
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {dismiss.isError && (
        <p className="text-sm text-destructive" role="alert" data-testid="home-team-update-error">
          {appErrorMessage(dismiss.error, translate, "teamRequests.actionFailed")}
        </p>
      )}
      <ItemGroup data-testid="home-team-updates">
        {requests.map((request) => {
          const approved = request.status === "approved";
          const StatusIcon = approved ? CheckCircleIcon : XCircleIcon;
          return (
            <Item
              key={request.id}
              variant="outline"
              className="flex-wrap"
              data-testid={`home-team-update-${request.id}`}
            >
              <ItemMedia variant="icon">
                <StatusIcon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="break-words">
                  {translate(
                    approved ? "teamRequests.approvedTitle" : "teamRequests.declinedTitle",
                    { team: request.teamName },
                  )}
                </ItemTitle>
                <ItemDescription>
                  {translate(approved ? "teamRequests.approvedHint" : "teamRequests.declinedHint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dismiss.isPending}
                  aria-busy={dismiss.isPending && dismiss.variables === request.id}
                  onClick={() => dismiss.mutate(request.id)}
                  data-testid={`home-team-update-dismiss-${request.id}`}
                >
                  {translate("teamRequests.dismiss")}
                </Button>
                {approved && (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={newAreaLink(request.teamAreas, nodeId)}
                    data-testid={`home-team-update-open-${request.id}`}
                  >
                    {translate("teamRequests.whatYouCanDo")}
                  </Button>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { type MouseEvent, useEffect } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button } from "@/components";
import { useSwitchTeam } from "@/components/layout/use-switch-team";
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

function newAreaTarget(areas: readonly FeatureArea[], nodeId: string | null): LinkProps {
  if (areas.includes("events") && nodeId) {
    return { to: "/nodes/$nodeId/content", params: { nodeId }, search: { tab: "events" } };
  }
  if (areas.includes("finance")) return { to: "/dashboard/node", hash: "payouts" };
  if (areas.includes("stake") && !areas.includes("node-operations")) return { to: "/stake" };
  return { to: "/dashboard/node" };
}

export function TeamRequestUpdates({
  organizationId,
  nodeId,
  activeTeamId,
  requests,
}: {
  organizationId: string;
  nodeId: string | null;
  activeTeamId: string | null;
  requests: TeamJoinRequest[];
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const switchTeam = useSwitchTeam();
  const openArea = (request: TeamJoinRequest, target: LinkProps) => (event: MouseEvent) => {
    if (!activeTeamId || activeTeamId === request.teamId) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    void switchTeam
      .mutateAsync(request.teamId)
      .then(() => router.navigate(target))
      .catch(() => {});
  };
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
          const target = newAreaTarget(request.teamAreas, nodeId);
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
                    disabled={switchTeam.isPending}
                    render={<Link {...target} onClick={openArea(request, target)} />}
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

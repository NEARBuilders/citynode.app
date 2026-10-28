import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Badge, Button, SectionHeader, Skeleton } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { FEATURE_AREA_MESSAGES } from "@/lib/feature-areas";
import { teamJoinBoardQueryOptions, teamJoinQueryKeys } from "@/lib/queries/team-join-requests";

type TeamJoinBoard = Awaited<ReturnType<ApiClient["getTeamJoinBoard"]>>;
type TeamJoinRequest = TeamJoinBoard["requests"][number];
type TeamAction =
  | { kind: "ask"; teamId: string }
  | { kind: "withdraw"; requestId: string }
  | { kind: "endorse"; requestId: string }
  | { kind: "approve"; requestId: string }
  | { kind: "decline"; requestId: string };

const CLOSED_REASON_MESSAGES = {
  requester_left: "teamRequests.closedRequesterLeft",
  team_deleted: "teamRequests.closedTeamDeleted",
  team_not_joinable: "teamRequests.closedTeamNotJoinable",
} as const;

const STATUS_MESSAGES = {
  pending: "teamRequests.statusPending",
  approved: "teamRequests.statusApproved",
  declined: "teamRequests.statusDeclined",
  withdrawn: "teamRequests.statusWithdrawn",
  closed: "teamRequests.statusClosed",
} as const;

export function TeamRequests({ organizationId }: { organizationId: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const board = useQuery(teamJoinBoardQueryOptions(apiClient, organizationId));
  const act = useMutation({
    mutationFn: (action: TeamAction) => {
      switch (action.kind) {
        case "ask":
          return apiClient.requestToJoinTeam({ organizationId, teamId: action.teamId });
        case "withdraw":
          return apiClient.withdrawTeamJoinRequest({ requestId: action.requestId });
        case "endorse":
          return apiClient.endorseTeamJoinRequest({ requestId: action.requestId });
        case "approve":
        case "decline":
          return apiClient.decideTeamJoinRequest({
            requestId: action.requestId,
            decision: action.kind,
          });
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: teamJoinQueryKeys.organization(organizationId) }),
  });
  const busy = (action: TeamAction) =>
    act.isPending && JSON.stringify(act.variables) === JSON.stringify(action);
  const actionButton = (
    action: TeamAction,
    label: string,
    testId: string,
    variant: "default" | "outline" = "outline",
  ) => (
    <Button
      size="sm"
      variant={variant}
      disabled={act.isPending}
      aria-busy={busy(action)}
      onClick={() => act.mutate(action)}
      data-testid={testId}
    >
      {label}
    </Button>
  );

  return (
    <section className="flex min-w-0 flex-col gap-6" data-testid="dashboard-node.teams">
      <SectionHeader
        title={translate("teamRequests.title")}
        description={translate("teamRequests.description")}
      />
      {act.isError && (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-testid="dashboard-node.team-action-error"
        >
          {appErrorMessage(act.error, translate, "teamRequests.actionFailed")}
        </p>
      )}
      {board.isPending ? (
        <Skeleton className="h-16 w-full" data-testid="dashboard-node.teams-loading" />
      ) : board.isError ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          role="alert"
          data-testid="dashboard-node.teams-error"
        >
          <span>{translate("teamRequests.loadFailed")}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={board.isFetching}
            onClick={() => void board.refetch()}
            data-testid="dashboard-node.teams-retry"
          >
            {translate("common.retry")}
          </Button>
        </div>
      ) : (
        <>
          {board.data.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="dashboard-node.teams-empty">
              {translate("teamRequests.noTeams")}
            </p>
          ) : (
            <ItemGroup>
              {board.data.teams.map((team) => (
                <Item
                  key={team.id}
                  variant="outline"
                  className="flex-wrap"
                  data-testid={`dashboard-node.team-${team.id}`}
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle className="break-words">{team.name}</ItemTitle>
                    <div className="flex flex-wrap gap-1">
                      {team.areas.map((area) => (
                        <Badge key={area} variant="secondary">
                          {translate(FEATURE_AREA_MESSAGES[area])}
                        </Badge>
                      ))}
                    </div>
                  </ItemContent>
                  <ItemActions>
                    {team.isMember ? (
                      <span className="text-sm text-muted-foreground">
                        {translate("teamRequests.onTeam")}
                      </span>
                    ) : team.pendingRequestId ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {translate("teamRequests.asked")}
                        </span>
                        {actionButton(
                          { kind: "withdraw", requestId: team.pendingRequestId },
                          translate("teamRequests.withdraw"),
                          `dashboard-node.team-withdraw-${team.id}`,
                        )}
                      </>
                    ) : (
                      actionButton(
                        { kind: "ask", teamId: team.id },
                        translate("teamRequests.ask"),
                        `dashboard-node.team-ask-${team.id}`,
                        "default",
                      )
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
          <RequestList
            requests={board.data.requests.filter((request) => !request.isMine)}
            canReview={board.data.canReview}
            renderActions={(request) => (
              <>
                {request.canEndorse &&
                  (request.endorsedByMe ? (
                    <span className="text-sm text-muted-foreground">
                      {translate("teamRequests.endorsed")}
                    </span>
                  ) : (
                    actionButton(
                      { kind: "endorse", requestId: request.id },
                      translate("teamRequests.endorse"),
                      `dashboard-node.team-request-endorse-${request.id}`,
                    )
                  ))}
                {request.canDecide && (
                  <>
                    {actionButton(
                      { kind: "decline", requestId: request.id },
                      translate("teamRequests.decline"),
                      `dashboard-node.team-request-decline-${request.id}`,
                    )}
                    {actionButton(
                      { kind: "approve", requestId: request.id },
                      translate("teamRequests.approve"),
                      `dashboard-node.team-request-approve-${request.id}`,
                      "default",
                    )}
                  </>
                )}
              </>
            )}
          />
          <OwnRequests requests={board.data.requests.filter((request) => request.isMine)} />
        </>
      )}
    </section>
  );
}

function RequestList({
  requests,
  canReview,
  renderActions,
}: {
  requests: TeamJoinRequest[];
  canReview: boolean;
  renderActions: (request: TeamJoinRequest) => ReactNode;
}) {
  const translate = useAppTranslation();
  const nonePending = !requests.some((request) => request.status === "pending");
  const empty =
    canReview && nonePending ? (
      <p className="text-sm text-muted-foreground" data-testid="dashboard-node.team-requests-empty">
        {translate("teamRequests.noRequests")}
      </p>
    ) : null;
  if (requests.length === 0) return empty;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-medium">{translate("teamRequests.requestsTitle")}</h3>
      {empty}
      <ItemGroup data-testid="dashboard-node.team-requests">
        {requests.map((request) => (
          <Item
            key={request.id}
            variant="outline"
            size="sm"
            className="flex-wrap"
            data-testid={`dashboard-node.team-request-${request.id}`}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="break-words">
                {translate("teamRequests.requestTitle", {
                  name: request.requesterName ?? translate("members.unnamed"),
                  team: request.teamName,
                })}
              </ItemTitle>
              <ItemDescription>
                <RequestDetails request={request} />
              </ItemDescription>
            </ItemContent>
            <ItemActions className="flex-wrap">{renderActions(request)}</ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}

function OwnRequests({ requests }: { requests: TeamJoinRequest[] }) {
  const translate = useAppTranslation();
  const settled = requests.filter((request) => request.status !== "pending");
  if (settled.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-col gap-2" data-testid="dashboard-node.own-team-requests">
      {settled.map((request) => (
        <li key={request.id} className="text-sm text-muted-foreground">
          {translate("teamRequests.ownRequest", { team: request.teamName })}{" "}
          <RequestDetails request={request} />
        </li>
      ))}
    </ul>
  );
}

function RequestDetails({ request }: { request: TeamJoinRequest }) {
  const translate = useAppTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant={request.status === "pending" ? "outline" : "secondary"}>
        {translate(STATUS_MESSAGES[request.status])}
      </Badge>
      {request.closedReason && (
        <span data-testid={`dashboard-node.team-request-closed-${request.id}`}>
          {translate(CLOSED_REASON_MESSAGES[request.closedReason])}
        </span>
      )}
      {request.status === "pending" && (
        <span data-testid={`dashboard-node.team-request-endorsements-${request.id}`}>
          {translate("teamRequests.endorsements", { count: request.endorsementCount })}
        </span>
      )}
    </span>
  );
}

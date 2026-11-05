import { UsersThreeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Badge, EmptyState, LocalDate, SectionHeader } from "@/components";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppTranslation } from "@/i18n/runtime";
import { FEATURE_AREA_MESSAGES } from "@/lib/feature-areas";
import { communityTeamRequestsQueryOptions } from "@/lib/queries/engagement";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import { ListSkeleton, LoadError } from "../-admin-ui";

export function CommunityTeams({ tenantId }: { tenantId: string | null }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const tenantQuery = useQuery(tenantByIdQueryOptions(apiClient, tenantId ?? ""));
  const organizationId = tenantQuery.data?.orgId ?? "";
  const requestsQuery = useQuery({
    ...communityTeamRequestsQueryOptions(apiClient, organizationId),
    enabled: !!organizationId,
  });

  const header = (
    <SectionHeader
      title={translate("org.teams")}
      description={translate("admin.teams.description")}
      sectionTestId="admin-node.teams"
    />
  );

  if (!tenantId || (tenantQuery.isSuccess && !organizationId)) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">{translate("admin.teams.noSite")}</p>
      </section>
    );
  }

  const failed = tenantQuery.isError || requestsQuery.isError;
  const data = requestsQuery.data;

  return (
    <section className="flex flex-col gap-6">
      {header}
      {failed ? (
        <LoadError
          message={translate("admin.teams.failed")}
          onRetry={() =>
            void (tenantQuery.isError ? tenantQuery.refetch() : requestsQuery.refetch())
          }
          testId="admin-node-teams-error"
        />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : data.teams.length === 0 ? (
        <EmptyState
          icon={UsersThreeIcon}
          title={translate("admin.teams.empty")}
          description={translate("admin.teams.emptyDescription")}
          className="py-10"
        />
      ) : (
        <>
          <Table data-testid="admin-node-teams">
            <TableHeader>
              <TableRow>
                <TableHead>{translate("admin.teams.team")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {translate("admin.teams.areas")}
                </TableHead>
                <TableHead className="text-right">{translate("admin.teams.pending")}</TableHead>
                <TableHead className="text-right">{translate("admin.teams.approved")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {translate("admin.teams.lastRequest")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.teams.map((team) => (
                <TableRow key={team.teamId} data-testid={`admin-node-team-${team.teamId}`}>
                  <TableCell className="font-medium">{team.teamName}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {team.teamAreas.map((area) => (
                        <Badge key={area} variant="secondary">
                          {translate(FEATURE_AREA_MESSAGES[area])}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{team.pending}</TableCell>
                  <TableCell className="text-right tabular-nums">{team.approved}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    <LocalDate value={team.lastRequestAt} format="relative" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.pending.length > 0 && (
            <section className="flex flex-col gap-4">
              <SectionHeader
                title={translate("admin.teams.waitingTitle")}
                description={translate("admin.teams.waitingDescription")}
              />
              <ItemGroup data-testid="admin-node-team-requests">
                {data.pending.map((request) => (
                  <Item key={request.id} variant="outline" size="sm">
                    <ItemContent className="min-w-0">
                      <ItemTitle>
                        {translate("admin.teams.requestRow", {
                          name: request.requesterName ?? translate("admin.teams.someone"),
                          team: request.teamName,
                        })}
                      </ItemTitle>
                      <ItemDescription>
                        <LocalDate value={request.createdAt} format="relative" />
                        {" · "}
                        {translate("admin.teams.endorsements", {
                          count: request.endorsementCount,
                        })}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          )}
        </>
      )}
    </section>
  );
}

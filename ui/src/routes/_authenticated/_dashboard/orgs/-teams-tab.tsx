import { CaretRightIcon, PlusIcon, UserPlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { Button, EmptyState, Input, SectionHeader, TabsContent } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import type { MemberCardMember } from "./-member-card";
import { TeamCard, type TeamCardTeam, type TeamMembershipStatus } from "./-team-card";

export type TeamsTabTeam = TeamCardTeam;
export type { TeamMembershipStatus };

export function TeamsTab({
  canManage,
  isMutating,
  onAddMember,
  onAreasChange,
  onCreate,
  onDelete,
  onRemoveMember,
  onRetryMembers,
  onRename,
  orgMembers,
  teams,
  waitingRequests,
}: {
  canManage: boolean;
  isMutating: boolean;
  onAddMember: (teamId: string, userId: string) => void;
  onAreasChange: (teamId: string, areas: string[]) => void;
  onCreate: (name: string) => void;
  onDelete: (teamId: string) => void;
  onRemoveMember: (teamId: string, userId: string) => void;
  onRetryMembers?: (teamId: string) => void;
  onRename: (teamId: string, name: string) => void;
  orgMembers: MemberCardMember[];
  teams: TeamsTabTeam[];
  waitingRequests?: { count: number; link: ReactElement };
}) {
  const translate = useAppTranslation();
  const [teamName, setTeamName] = useState("");
  const trimmedName = teamName.trim();

  return (
    <TabsContent value="teams" className="flex flex-col gap-6 pt-6">
      <SectionHeader title={translate("org.teams")} description={translate("org.teamAreasHint")} />
      {waitingRequests && waitingRequests.count > 0 && (
        <Item
          variant="outline"
          className="max-w-lg"
          render={waitingRequests.link}
          data-testid="teams-tab-waiting-requests"
        >
          <ItemMedia variant="icon">
            <UserPlusIcon />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>
              {translate("teamRequests.waiting", { count: waitingRequests.count })}
            </ItemTitle>
            <ItemDescription>{translate("teamRequests.waitingHint")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <CaretRightIcon className="size-4 text-muted-foreground" />
          </ItemActions>
        </Item>
      )}
      {canManage && (
        <form
          className="flex w-full max-w-lg gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmedName) return;
            onCreate(trimmedName);
            setTeamName("");
          }}
        >
          <Input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder={translate("org.teamNameExample")}
            aria-label={translate("org.teamName")}
            className="min-w-0 flex-1"
            data-testid="teams-tab-create-input"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={isMutating || !trimmedName}
            data-testid="teams-tab-create-button"
          >
            <PlusIcon />
            {translate("org.createTeam")}
          </Button>
        </form>
      )}

      {teams.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              canManage={canManage}
              isMutating={isMutating}
              onAddMember={(userId) => onAddMember(team.id, userId)}
              onAreasChange={(areas) => onAreasChange(team.id, areas)}
              onDelete={() => onDelete(team.id)}
              onRemoveMember={(userId) => onRemoveMember(team.id, userId)}
              onRetryMembers={onRetryMembers ? () => onRetryMembers(team.id) : undefined}
              onRename={(name) => onRename(team.id, name)}
              orgMembers={orgMembers}
              team={team}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UsersThreeIcon}
          title={translate("org.noTeams")}
          description={canManage ? translate("org.noTeamsDescription") : undefined}
        />
      )}
    </TabsContent>
  );
}

import { useState } from "react";
import { Button, Card, Input, TabsContent } from "@/components";
import { OrganizationEmptyState } from "./-empty-state";
import type { MemberCardMember } from "./-member-card";
import { TeamCard, type TeamCardTeam } from "./-team-card";

export type TeamsTabTeam = TeamCardTeam;

export function TeamsTab({
  canManage,
  isMutating,
  onAddMember,
  onAreasChange,
  onCreate,
  onDelete,
  onRemoveMember,
  onRename,
  orgMembers,
  teams,
}: {
  canManage: boolean;
  isMutating: boolean;
  onAddMember: (teamId: string, userId: string) => void;
  onAreasChange: (teamId: string, areas: string[]) => void;
  onCreate: (name: string) => void;
  onDelete: (teamId: string) => void;
  onRemoveMember: (teamId: string, userId: string) => void;
  onRename: (teamId: string, name: string) => void;
  orgMembers: MemberCardMember[];
  teams: TeamsTabTeam[];
}) {
  const [teamName, setTeamName] = useState("");
  const trimmedName = teamName.trim();

  return (
    <TabsContent value="teams" className="space-y-6 pt-4">
      {canManage && (
        <Card className="p-6 space-y-4 hover:shadow-md">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Create team
          </div>
          <p className="text-sm text-muted-foreground">
            Teams group organization members by function. Grant each team the areas it works in;
            members operating as that team only see those areas.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
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
              placeholder="Finance, Node Operator…"
              aria-label="Team name"
              data-testid="teams-tab-create-input"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isMutating || !trimmedName}
              data-testid="teams-tab-create-button"
            >
              create team
            </Button>
          </form>
        </Card>
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
              onRename={(name) => onRename(team.id, name)}
              orgMembers={orgMembers}
              team={team}
            />
          ))}
        </div>
      ) : (
        <OrganizationEmptyState label="No teams yet" />
      )}
    </TabsContent>
  );
}

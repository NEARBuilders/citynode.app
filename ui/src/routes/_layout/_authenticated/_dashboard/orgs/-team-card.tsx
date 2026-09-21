import { FEATURE_AREA_LABELS, FEATURE_AREAS } from "api/feature-areas";
import { Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, Input } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import type { MemberCardMember } from "./-member-card";

export interface TeamCardTeam {
  id: string;
  name: string;
  areas: string[];
  memberUserIds: string[];
}

function memberLabel(member: MemberCardMember | undefined, userId: string) {
  return member?.user?.name || member?.user?.email || userId;
}

export function TeamCard({
  canManage,
  isMutating,
  onAddMember,
  onAreasChange,
  onDelete,
  onRemoveMember,
  onRename,
  orgMembers,
  team,
}: {
  canManage: boolean;
  isMutating: boolean;
  onAddMember: (userId: string) => void;
  onAreasChange: (areas: string[]) => void;
  onDelete: () => void;
  onRemoveMember: (userId: string) => void;
  onRename: (name: string) => void;
  orgMembers: MemberCardMember[];
  team: TeamCardTeam;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(team.name);
  const [selectedUserId, setSelectedUserId] = useState("");
  const membersByUserId = new Map(orgMembers.map((member) => [member.userId, member]));
  const candidates = orgMembers.filter((member) => !team.memberUserIds.includes(member.userId));

  const toggleArea = (area: string, checked: boolean) => {
    const next = checked
      ? [...team.areas.filter((granted) => granted !== area), area]
      : team.areas.filter((granted) => granted !== area);
    onAreasChange(next);
  };

  return (
    <Card className="hover:shadow-md" data-testid={`teams-tab-team-${team.id}`}>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          {isRenaming ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = draftName.trim();
                if (!name) return;
                onRename(name);
                setIsRenaming(false);
              }}
            >
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                aria-label="Team name"
                data-testid={`teams-tab-rename-input-${team.id}`}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={isMutating || !draftName.trim()}
                data-testid={`teams-tab-rename-save-${team.id}`}
              >
                save
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsRenaming(false)}>
                cancel
              </Button>
            </form>
          ) : (
            <div className="min-w-0">
              <div className="font-semibold break-words">{team.name}</div>
              <div className="text-xs text-muted-foreground">
                {team.memberUserIds.length} member{team.memberUserIds.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
          {canManage && !isRenaming && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                onClick={() => {
                  setDraftName(team.name);
                  setIsRenaming(true);
                }}
                disabled={isMutating}
                data-testid={`teams-tab-rename-${team.id}`}
              >
                <Pencil className="h-3 w-3 mr-1" />
                rename
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={isMutating}
                data-testid={`teams-tab-delete-${team.id}`}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                delete
              </Button>
            </div>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Areas
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_AREAS.map((area) => {
              const checkboxId = `team-${team.id}-area-${area}`;
              return (
                <div key={area} className="flex items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={team.areas.includes(area)}
                    disabled={!canManage || isMutating}
                    onCheckedChange={(checked) => toggleArea(area, checked === true)}
                    data-testid={`teams-tab-area-${team.id}-${area}`}
                  />
                  <label htmlFor={checkboxId} className="text-sm">
                    {FEATURE_AREA_LABELS[area]}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Members
          </div>
          {team.memberUserIds.length > 0 ? (
            <ul className="space-y-1">
              {team.memberUserIds.map((userId) => (
                <li key={userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {memberLabel(membersByUserId.get(userId), userId)}
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveMember(userId)}
                      disabled={isMutating}
                      aria-label={`Remove ${memberLabel(membersByUserId.get(userId), userId)}`}
                      data-testid={`teams-tab-remove-member-${team.id}-${userId}`}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No members in this team</p>
          )}
          {canManage && (
            <div className="flex gap-2 pt-1">
              <select
                aria-label={`Add member to ${team.name}`}
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={candidates.length === 0 || isMutating}
                data-testid={`teams-tab-add-member-${team.id}`}
                className="w-full px-3 py-2 text-sm bg-card text-foreground border-2 border-inset border-border-strong rounded-[8px] outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">
                  {candidates.length === 0 ? "All organization members added" : "Select a member"}
                </option>
                {candidates.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {memberLabel(member, member.userId)}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={!selectedUserId || isMutating}
                onClick={() => {
                  onAddMember(selectedUserId);
                  setSelectedUserId("");
                }}
                data-testid={`teams-tab-add-member-button-${team.id}`}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                add
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

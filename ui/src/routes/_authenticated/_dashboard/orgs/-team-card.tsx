import { PencilIcon, TrashIcon, UserMinusIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Card, CardContent, Input } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEATURE_AREA_LABELS, FEATURE_AREAS } from "@/lib/feature-areas";
import type { MemberCardMember } from "./-member-card";

export interface TeamCardTeam {
  id: string;
  name: string;
  areas: string[];
  memberUserIds: string[];
  memberStatus?: TeamMembershipStatus;
  memberError?: string;
}

export type TeamMembershipStatus = "unloaded" | "loading" | "success" | "error";

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
  onRetryMembers,
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
  onRetryMembers?: () => void;
  onRename: (name: string) => void;
  orgMembers: MemberCardMember[];
  team: TeamCardTeam;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(team.name);
  const [selectedUserId, setSelectedUserId] = useState("");
  const membersByUserId = new Map(orgMembers.map((member) => [member.userId, member]));
  const memberStatus = team.memberStatus ?? "success";
  const membersLoaded = memberStatus === "success";
  const candidates = membersLoaded
    ? orgMembers.filter((member) => !team.memberUserIds.includes(member.userId))
    : [];
  const selectItems = candidates.map((member) => ({
    label: memberLabel(member, member.userId),
    value: member.userId,
  }));
  const placeholder = !membersLoaded
    ? "Members unavailable"
    : candidates.length === 0
      ? "All organization members added"
      : "Select a member";

  const toggleArea = (area: string, checked: boolean) => {
    const next = checked
      ? [...team.areas.filter((granted) => granted !== area), area]
      : team.areas.filter((granted) => granted !== area);
    onAreasChange(next);
  };

  return (
    <Card data-testid={`teams-tab-team-${team.id}`}>
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
              {memberStatus === "success" && (
                <div className="text-xs text-muted-foreground">
                  {team.memberUserIds.length} member{team.memberUserIds.length === 1 ? "" : "s"}
                </div>
              )}
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
                <PencilIcon className="h-3 w-3 mr-1" />
                rename
              </Button>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={isMutating}
                data-testid={`teams-tab-delete-${team.id}`}
              >
                <TrashIcon className="h-3 w-3 mr-1" />
                delete
              </Button>
            </div>
          )}
        </div>

        <FieldSet>
          <FieldLegend variant="label">Areas</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_AREAS.map((area) => {
              const checkboxId = `team-${team.id}-area-${area}`;
              return (
                <Field key={area} orientation="horizontal">
                  <Checkbox
                    id={checkboxId}
                    checked={team.areas.includes(area)}
                    disabled={!canManage || isMutating}
                    onCheckedChange={(checked) => toggleArea(area, checked === true)}
                    data-testid={`teams-tab-area-${team.id}-${area}`}
                  />
                  <FieldLabel htmlFor={checkboxId}>{FEATURE_AREA_LABELS[area]}</FieldLabel>
                </Field>
              );
            })}
          </div>
        </FieldSet>

        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Members</div>
          {memberStatus === "loading" ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading members...
            </p>
          ) : memberStatus === "error" ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">
                {team.memberError || "Unable to load team members."}
              </p>
              {onRetryMembers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetryMembers}
                  data-testid={`teams-tab-retry-members-${team.id}`}
                >
                  retry
                </Button>
              )}
            </div>
          ) : memberStatus === "unloaded" ? (
            <p className="text-sm text-muted-foreground">Members are not loaded yet</p>
          ) : team.memberUserIds.length > 0 ? (
            <ul className="space-y-1">
              {team.memberUserIds.map((userId) => (
                <li key={userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {memberLabel(membersByUserId.get(userId), userId)}
                  </span>
                  {canManage && membersLoaded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveMember(userId)}
                      disabled={isMutating}
                      aria-label={`Remove ${memberLabel(membersByUserId.get(userId), userId)}`}
                      data-testid={`teams-tab-remove-member-${team.id}-${userId}`}
                    >
                      <UserMinusIcon className="h-3.5 w-3.5" />
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
              <Select
                items={selectItems}
                value={selectedUserId || null}
                onValueChange={(value) => setSelectedUserId(typeof value === "string" ? value : "")}
                disabled={!membersLoaded || candidates.length === 0 || isMutating}
              >
                <SelectTrigger
                  aria-label={`Add member to ${team.name}`}
                  className="w-full min-w-0"
                  data-testid={`teams-tab-add-member-${team.id}`}
                >
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((member) => (
                    <SelectItem
                      key={member.userId}
                      value={member.userId}
                      data-testid={`teams-tab-add-member-option-${team.id}-${member.userId}`}
                    >
                      {memberLabel(member, member.userId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!membersLoaded || !selectedUserId || isMutating}
                onClick={() => {
                  onAddMember(selectedUserId);
                  setSelectedUserId("");
                }}
                data-testid={`teams-tab-add-member-button-${team.id}`}
              >
                <UserPlusIcon className="h-3.5 w-3.5 mr-1" />
                add
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

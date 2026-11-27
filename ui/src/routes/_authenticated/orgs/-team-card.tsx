import { PencilSimpleIcon, TrashIcon, UserMinusIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Card, CardContent, Input } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppTranslation } from "@/i18n/runtime";
import { FEATURE_AREA_MESSAGES, FEATURE_AREAS } from "@/lib/feature-areas";
import { MemberAvatar, type MemberCardMember, memberDisplayName } from "./-member-card";
import { RowMenu } from "./-row-menu";

export interface TeamCardTeam {
  id: string;
  name: string;
  areas: string[];
  memberUserIds: string[];
  memberStatus?: TeamMembershipStatus;
  memberError?: string;
}

export type TeamMembershipStatus = "unloaded" | "loading" | "success" | "error";

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
  const translate = useAppTranslation();
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
    label: memberDisplayName(member, member.userId),
    value: member.userId,
  }));
  const placeholder = !membersLoaded
    ? translate("org.memberUnavailable")
    : candidates.length === 0
      ? translate("org.allMembersInTeam")
      : translate("org.addMemberPlaceholder");

  const toggleArea = (area: string, checked: boolean) => {
    const next = checked
      ? [...team.areas.filter((granted) => granted !== area), area]
      : team.areas.filter((granted) => granted !== area);
    onAreasChange(next);
  };

  return (
    <Card data-testid={`teams-tab-team-${team.id}`}>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="flex items-start justify-between gap-3">
          {isRenaming ? (
            <form
              className="flex flex-1 flex-wrap gap-2"
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
                aria-label={translate("org.teamName")}
                autoFocus
                className="min-w-0 flex-1"
                data-testid={`teams-tab-rename-input-${team.id}`}
              />
              <Button
                type="submit"
                disabled={isMutating || !draftName.trim()}
                data-testid={`teams-tab-rename-save-${team.id}`}
              >
                {translate("common.save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsRenaming(false)}>
                {translate("common.cancel")}
              </Button>
            </form>
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-lg font-medium break-words text-foreground">{team.name}</h3>
              {memberStatus === "success" && (
                <span className="text-sm text-muted-foreground">
                  {translate("org.memberCount", { count: team.memberUserIds.length })}
                </span>
              )}
            </div>
          )}
          {canManage && !isRenaming && (
            <RowMenu
              label={translate("common.actionsNamed", { name: team.name ?? "" })}
              disabled={isMutating}
              testId={`teams-tab-menu-${team.id}`}
            >
              <DropdownMenuItem
                onClick={() => {
                  setDraftName(team.name);
                  setIsRenaming(true);
                }}
                data-testid={`teams-tab-rename-${team.id}`}
              >
                <PencilSimpleIcon />
                {translate("org.renameTeam")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={onDelete}
                data-testid={`teams-tab-delete-${team.id}`}
              >
                <TrashIcon />
                {translate("org.deleteTeam")}
              </DropdownMenuItem>
            </RowMenu>
          )}
        </div>

        <FieldSet>
          <FieldLegend variant="label">{translate("org.canUse")}</FieldLegend>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {FEATURE_AREAS.map((area) => {
              const checkboxId = `team-${team.id}-area-${area}`;
              return (
                <Field key={area} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={checkboxId}
                    checked={team.areas.includes(area)}
                    disabled={!canManage || isMutating}
                    onCheckedChange={(checked) => toggleArea(area, checked === true)}
                    data-testid={`teams-tab-area-${team.id}-${area}`}
                  />
                  <FieldLabel htmlFor={checkboxId}>
                    {translate(FEATURE_AREA_MESSAGES[area])}
                  </FieldLabel>
                </Field>
              );
            })}
          </div>
        </FieldSet>

        <div className="flex flex-col gap-3">
          {memberStatus === "loading" ? (
            <p className="text-sm text-muted-foreground" role="status">
              {translate("org.loadingMembers")}
            </p>
          ) : memberStatus === "error" ? (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm text-destructive">
                {team.memberError || translate("org.loadMembersFailed")}
              </p>
              {onRetryMembers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetryMembers}
                  data-testid={`teams-tab-retry-members-${team.id}`}
                >
                  {translate("org.retry")}
                </Button>
              )}
            </div>
          ) : memberStatus === "unloaded" ? (
            <p className="text-sm text-muted-foreground">{translate("org.membersNotLoaded")}</p>
          ) : team.memberUserIds.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {team.memberUserIds.map((userId) => {
                const member = membersByUserId.get(userId);
                const name = memberDisplayName(member, userId);
                return (
                  <li key={userId} className="flex min-h-11 items-center gap-3">
                    <MemberAvatar member={member} fallback={userId} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span>
                    {canManage && membersLoaded && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemoveMember(userId)}
                        disabled={isMutating}
                        aria-label={translate("org.removeTeamMember", {
                          name: name ?? "",
                          team: team.name ?? "",
                        })}
                        data-testid={`teams-tab-remove-member-${team.id}-${userId}`}
                      >
                        <UserMinusIcon />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{translate("org.noTeamMembers")}</p>
          )}
          {canManage && (
            <div className="flex gap-2">
              <Select
                items={selectItems}
                value={selectedUserId || null}
                onValueChange={(value) => setSelectedUserId(typeof value === "string" ? value : "")}
                disabled={!membersLoaded || candidates.length === 0 || isMutating}
              >
                <SelectTrigger
                  aria-label={translate("org.addTeamMember", { team: team.name ?? "" })}
                  className="w-full min-w-0 flex-1"
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
                      {memberDisplayName(member, member.userId)}
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
                <UserPlusIcon />
                {translate("common.add")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

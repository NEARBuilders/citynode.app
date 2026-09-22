import { TabsContent } from "@/components";
import { OrganizationEmptyState } from "./-empty-state";
import { MemberCard, type MemberCardMember } from "./-member-card";

export function MembersTab({
  canManageMembers,
  isRemoving,
  members,
  onRemove,
  sessionUserId,
}: {
  canManageMembers: boolean;
  isRemoving: boolean;
  members: MemberCardMember[];
  onRemove: (member: MemberCardMember) => void;
  sessionUserId: string | undefined;
}) {
  return (
    <TabsContent value="members" className="space-y-6 pt-4">
      {members.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              canManage={canManageMembers && member.userId !== sessionUserId}
              onRemove={() => onRemove(member)}
              isRemoving={isRemoving}
            />
          ))}
        </div>
      ) : (
        <OrganizationEmptyState label="No members found" />
      )}
    </TabsContent>
  );
}

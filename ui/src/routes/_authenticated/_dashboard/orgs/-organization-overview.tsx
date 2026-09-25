import { PencilSimpleIcon, SignOutIcon, TrashIcon } from "@phosphor-icons/react";
import type { Organization } from "@/app";
import { Button, Card, Chip, InfoRow } from "@/components";
import { useClientValue } from "@/hooks";

export function OrganizationOverview({
  canDelete,
  apiKeysCount,
  memberCount,
  pendingInvitationsCount,
  isActive,
  isDeleting,
  isLeaving,
  isPersonal,
  isSwitching,
  onDelete,
  onEdit,
  onLeave,
  onSwitch,
  org,
}: {
  canDelete: boolean;
  apiKeysCount: number;
  memberCount: number;
  pendingInvitationsCount: number;
  isActive: boolean;
  isDeleting: boolean;
  isPersonal: boolean;
  isLeaving: boolean;
  isSwitching: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onSwitch: () => void;
  org: Organization;
}) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Chip>organization</Chip>
        {isActive && <Chip accent>active</Chip>}
        {isPersonal && <Chip>personal</Chip>}
      </div>
      <div className="flex flex-col gap-2">
        <InfoRow label="members" value={String(memberCount)} />
        <InfoRow label="invites" value={String(pendingInvitationsCount)} />
        <InfoRow label="api keys" value={String(apiKeysCount)} />
        {org.createdAt && <CreatedRow createdAt={org.createdAt} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {!isActive && (
          <Button onClick={onSwitch} disabled={isSwitching}>
            {isSwitching ? "switching..." : "switch to org"}
          </Button>
        )}
        {canDelete && !isPersonal && (
          <Button variant="outline" onClick={onEdit}>
            <PencilSimpleIcon className="h-3.5 w-3.5" />
            edit
          </Button>
        )}
        {!isPersonal && !canDelete && (
          <Button variant="outline" onClick={onLeave} disabled={isLeaving}>
            <SignOutIcon className="h-3.5 w-3.5" />
            leave
          </Button>
        )}
        {canDelete && !isPersonal && (
          <Button variant="outline" onClick={onDelete} disabled={isDeleting}>
            <TrashIcon className="h-3.5 w-3.5" />
            delete org
          </Button>
        )}
      </div>
    </Card>
  );
}

function CreatedRow({ createdAt }: { createdAt: string | Date }) {
  const value = useClientValue(() => new Date(createdAt).toLocaleDateString(), "");
  return <InfoRow label="created" value={value} />;
}

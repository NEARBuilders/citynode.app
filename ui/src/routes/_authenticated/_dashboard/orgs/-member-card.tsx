import { ShieldIcon, TrashIcon, UserGearIcon, UserIcon } from "@phosphor-icons/react";
import { Badge, Button, Card, CardContent } from "@/components";

export interface MemberCardMember {
  id: string;
  userId: string;
  role: string;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function MemberCard({
  canManage,
  isRemoving,
  isUpdatingRole,
  member,
  onRemove,
  onUpdateRole,
}: {
  member: MemberCardMember;
  canManage: boolean;
  onRemove?: () => void;
  onUpdateRole?: (role: "owner" | "admin" | "member") => void;
  isRemoving?: boolean;
  isUpdatingRole?: boolean;
}) {
  const user = member.user;

  return (
    <Card className="hover:shadow-md">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {user?.image ? (
              <img
                src={user.image}
                alt=""
                className="w-9 h-9 rounded-full object-cover border-2 border-outset border-border-strong"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="font-medium text-sm truncate">
                {user?.name || user?.email || member.userId}
              </div>
              {user?.email && user.name && (
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              )}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {member.role}
          </Badge>
        </div>

        {canManage && onUpdateRole && (
          <div className="flex flex-wrap gap-2">
            {member.role !== "owner" && (
              <Button
                onClick={() => onUpdateRole("owner")}
                disabled={isUpdatingRole}
                variant="outline"
                size="sm"
              >
                <ShieldIcon className="h-3 w-3 mr-1" />
                make owner
              </Button>
            )}
            {member.role !== "admin" && (
              <Button
                onClick={() => onUpdateRole("admin")}
                disabled={isUpdatingRole}
                variant="outline"
                size="sm"
              >
                <UserGearIcon className="h-3 w-3 mr-1" />
                make admin
              </Button>
            )}
            {member.role !== "member" && (
              <Button
                onClick={() => onUpdateRole("member")}
                disabled={isUpdatingRole}
                variant="outline"
                size="sm"
              >
                make member
              </Button>
            )}
          </div>
        )}

        {canManage && onRemove && (
          <Button
            onClick={onRemove}
            disabled={isRemoving}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <TrashIcon className="h-3 w-3 mr-1" />
            {isRemoving ? "removing..." : "remove"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

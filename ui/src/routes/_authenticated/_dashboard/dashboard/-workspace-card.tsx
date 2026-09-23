import type { SessionData } from "@/app";
import { Card, Chip } from "@/components";
import type { WorkspaceIdentityProfile } from "./-workspace-identity-types";

export function WorkspaceCard({
  profile,
  tenantMember,
  user,
}: {
  profile: WorkspaceIdentityProfile;
  tenantMember: boolean;
  user: SessionData["user"];
}) {
  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Chip>workspace</Chip>
        {profile.isAnonymous && <Chip>anonymous</Chip>}
        {profile.isAdmin && <Chip accent>admin</Chip>}
        {tenantMember && <Chip accent>tenant member</Chip>}
      </div>
      <h2 className="text-foreground text-xl font-semibold">
        {user.name || user.email || user.id.slice(0, 8)}
      </h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Manage your identity and connected accounts.
      </p>
    </Card>
  );
}

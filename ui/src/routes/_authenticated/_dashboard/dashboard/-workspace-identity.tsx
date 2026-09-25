import { Link } from "@tanstack/react-router";
import { Home as HomeIcon, Settings } from "lucide-react";
import { pluginPath } from "@/app";
import { Button, PageHeader } from "@/components";
import { IdentityStatus } from "./-identity-status";
import { WorkspaceCard } from "./-workspace-card";
import type { WorkspaceIdentityProps } from "./-workspace-identity-types";

export function WorkspaceIdentity({
  nearAccountId,
  passkeys,
  profile,
  tenantMember,
  user,
}: WorkspaceIdentityProps) {
  return (
    <>
      <PageHeader
        icon={HomeIcon}
        label="Workspace"
        title={user?.name || user?.email || "You"}
        actions={
          <Button asChild variant="outline">
            <Link to={pluginPath("/settings")} preload="intent">
              <Settings />
              settings
            </Link>
          </Button>
        }
      />

      {!user && <div className="text-muted-foreground py-12 text-center text-sm">Loading…</div>}
      {user && (
        <>
          <WorkspaceCard profile={profile} tenantMember={tenantMember} user={user} />
          <IdentityStatus
            nearAccountId={nearAccountId}
            passkeys={passkeys}
            profile={profile}
            user={user}
          />
        </>
      )}
    </>
  );
}

import { Link } from "@tanstack/react-router";
import { Building2, Home, LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NetworkToggle } from "./network-toggle";
import { OrgSwitcher } from "./org-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useIdentity } from "./use-identity";

export function UserNav({ showConnect = true }: { showConnect?: boolean }) {
  const {
    user,
    nearAccountId,
    organizations,
    activeOrgId,
    activeOrg,
    signOutMutation,
    handleOrgSwitch,
    avatarSrc,
    displayName,
    handle,
    showHandle,
    initials,
  } = useIdentity();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ThemeToggle className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        <NetworkToggle />
        {showConnect && (
          <Button asChild variant="outline">
            <Link to="/login">connect</Link>
          </Button>
        )}
      </div>
    );
  }

  const identityContent = (
    <>
      <Avatar className="size-9 shrink-0 ring-1 ring-border">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback className="text-xs font-semibold">
          {initials || <User className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        {showHandle && <p className="truncate text-xs text-muted-foreground">{handle}</p>}
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
      {organizations && organizations.length > 0 && (
        <OrgSwitcher
          organizations={organizations}
          activeOrgId={activeOrgId}
          onSwitch={handleOrgSwitch}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={displayName}
            className="rounded-full! ring-1 ring-border transition-transform duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:scale-105"
            title="account menu"
          >
            <Avatar className="size-8">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
              <AvatarFallback className="text-xs font-semibold">
                {initials || <User className="size-4" />}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            {nearAccountId ? (
              <Link to="/$accountId" params={{ accountId: nearAccountId }}>
                {identityContent}
              </Link>
            ) : (
              <Link to="/settings/profile">{identityContent}</Link>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard">
              <Home />
              workspace
            </Link>
          </DropdownMenuItem>
          {activeOrg && (
            <DropdownMenuItem asChild>
              <Link to="/orgs/$slug" params={{ slug: activeOrg.slug }}>
                <Building2 />
                {activeOrg.name}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings />
              settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              signOutMutation.mutate();
            }}
            disabled={signOutMutation.isPending}
          >
            <LogOut />
            {signOutMutation.isPending ? "signing out..." : "sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

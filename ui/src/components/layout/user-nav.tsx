import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NetworkToggle } from "./network-toggle";
import { OrgSwitcher } from "./org-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useIdentity } from "./use-identity";
import { UserNavMenuContent } from "./user-nav-menu";

export function UserNav({ showConnect = true }: { showConnect?: boolean }) {
  const {
    user,
    nearAccountId,
    organizations,
    activeOrgId,
    activeOrg,
    signOutMutation,
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

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
      {organizations.length > 0 && (
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
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
        <UserNavMenuContent
          nearAccountId={nearAccountId}
          activeOrg={activeOrg}
          avatarSrc={avatarSrc}
          displayName={displayName}
          handle={handle}
          showHandle={showHandle}
          initials={initials}
          signOutMutation={signOutMutation}
          align="end"
          header="inline"
        />
      </DropdownMenu>
    </div>
  );
}

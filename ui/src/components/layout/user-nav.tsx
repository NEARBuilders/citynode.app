import { UserIcon } from "@phosphor-icons/react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { pluginPath } from "@/app";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NetworkToggle } from "./network-toggle";
import { OrgSwitcher } from "./org-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useIdentity } from "./use-identity";
import { UserNavMenuContent } from "./user-nav-menu";

interface UserNavProps {
  showConnect?: boolean;
  showOrgSwitcher?: boolean;
}

export function UserNav({ showConnect = true, showOrgSwitcher = true }: UserNavProps) {
  return (
    <ClientOnly>
      <UserNavContent showConnect={showConnect} showOrgSwitcher={showOrgSwitcher} />
    </ClientOnly>
  );
}

function UserNavContent({ showConnect = true, showOrgSwitcher = true }: UserNavProps) {
  const {
    user,
    isSessionLoading,
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

  if (isSessionLoading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
        <ThemeToggle className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        <NetworkToggle />
        {showConnect && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={pluginPath("/login")} />}
          >
            connect
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <ThemeToggle className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
      {showOrgSwitcher && organizations.length > 0 && (
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={displayName}
              data-testid="account-menu"
              className="rounded-full! ring-1 ring-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              title="account menu"
            />
          }
        >
          <Avatar className="size-8">
            {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
            <AvatarFallback className="text-xs font-semibold">
              {initials || <UserIcon className="size-4" />}
            </AvatarFallback>
          </Avatar>
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
        />
      </DropdownMenu>
    </div>
  );
}

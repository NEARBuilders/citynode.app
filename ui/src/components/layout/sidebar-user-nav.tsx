import { Link } from "@tanstack/react-router";
import { Building2, ChevronsUpDown, Home, LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIdentity } from "./use-identity";

export function SidebarUserNav() {
  const { isMobile } = useSidebar();
  const {
    user,
    nearAccountId,
    activeOrg,
    signOutMutation,
    avatarSrc,
    displayName,
    handle,
    showHandle,
    initials,
  } = useIdentity();

  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 shrink-0 ring-1 ring-border">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
                <AvatarFallback className="text-xs font-semibold">
                  {initials || <User className="size-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                {showHandle && <span className="truncate text-xs">{handle}</span>}
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 shrink-0 ring-1 ring-border">
                  {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
                  <AvatarFallback className="text-xs font-semibold">
                    {initials || <User className="size-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  {showHandle && (
                    <span className="truncate text-xs text-muted-foreground">{handle}</span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              {nearAccountId ? (
                <Link to="/$accountId" params={{ accountId: nearAccountId }}>
                  <User />
                  profile
                </Link>
              ) : (
                <Link to="/settings/profile">
                  <User />
                  profile
                </Link>
              )}
            </DropdownMenuItem>
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

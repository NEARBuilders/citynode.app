import { ChevronsUpDown, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIdentity } from "./use-identity";
import { UserNavMenuContent } from "./user-nav-menu";

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
          <UserNavMenuContent
            nearAccountId={nearAccountId}
            activeOrg={activeOrg}
            avatarSrc={avatarSrc}
            displayName={displayName}
            handle={handle}
            showHandle={showHandle}
            initials={initials}
            signOutMutation={signOutMutation}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
            header="label"
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

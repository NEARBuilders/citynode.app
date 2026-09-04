import { Link } from "@tanstack/react-router";
import { Building2, Home, LogOut, Settings, User } from "lucide-react";
import type { Organization } from "@/app";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SignOutMutationLike {
  mutate: () => void;
  isPending: boolean;
}

interface UserNavMenuContentProps {
  nearAccountId: string | null | undefined;
  activeOrg: Organization | undefined;
  avatarSrc: string | undefined;
  displayName: string;
  handle: string;
  showHandle: boolean;
  initials: string;
  signOutMutation: SignOutMutationLike;
  className?: string;
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  header?: "inline" | "label";
}

export function UserNavMenuContent({
  nearAccountId,
  activeOrg,
  avatarSrc,
  displayName,
  handle,
  showHandle,
  initials,
  signOutMutation,
  className = "w-64",
  align = "end",
  side,
  sideOffset,
  header = "inline",
}: UserNavMenuContentProps) {
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
    <DropdownMenuContent className={className} align={align} side={side} sideOffset={sideOffset}>
      {header === "label" ? (
        <>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              {identityContent}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      ) : (
        <>
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
        </>
      )}

      {header === "label" && (
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
      )}
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
        data-testid="account.signout-menuitem"
      >
        <LogOut />
        {signOutMutation.isPending ? "signing out..." : "sign out"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

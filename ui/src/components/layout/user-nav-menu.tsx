import { BankIcon, GearIcon, HouseIcon, SignOutIcon, UserIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { Organization } from "@/app";
import { pluginPath } from "@/app";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuContent,
  DropdownMenuItem,
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
}: UserNavMenuContentProps) {
  const identityContent = (
    <>
      <Avatar className="size-9 shrink-0 ring-1 ring-border">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback className="text-xs font-semibold">
          {initials || <UserIcon className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        {showHandle && <p className="truncate text-xs text-muted-foreground">{handle}</p>}
      </div>
    </>
  );

  return (
    <DropdownMenuContent className={className} align={align}>
      <DropdownMenuItem
        render={
          nearAccountId ? (
            <Link to="/$accountId" params={{ accountId: nearAccountId }} />
          ) : (
            <Link to={pluginPath("/settings/profile")} />
          )
        }
      >
        {identityContent}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link to="/dashboard" />}>
        <HouseIcon />
        workspace
      </DropdownMenuItem>
      {activeOrg && (
        <DropdownMenuItem render={<Link to="/orgs/$slug" params={{ slug: activeOrg.slug }} />}>
          <BankIcon />
          {activeOrg.name}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem render={<Link to={pluginPath("/settings")} />}>
        <GearIcon />
        settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        closeOnClick={false}
        onClick={() => signOutMutation.mutate()}
        disabled={signOutMutation.isPending}
        data-testid="account.signout-menuitem"
      >
        <SignOutIcon />
        {signOutMutation.isPending ? "signing out..." : "sign out"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

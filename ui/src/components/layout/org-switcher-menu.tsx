import { BankIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { Organization } from "@/app";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSwitchOrganization } from "./use-switch-organization";

interface OrgSwitcherMenuContentProps {
  organizations: Organization[];
  activeOrgId?: string | null;
  className?: string;
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  itemVariant?: "plain" | "iconTile";
}

export function OrgSwitcherMenuContent({
  organizations,
  activeOrgId,
  className = "w-56",
  align = "end",
  side,
  sideOffset,
  itemVariant = "plain",
}: OrgSwitcherMenuContentProps) {
  const switchOrg = useSwitchOrganization();

  const handleSwitch = (orgId: string) => {
    if (orgId === activeOrgId || switchOrg.isPending) return;
    switchOrg.mutate(orgId);
  };

  return (
    <DropdownMenuContent className={className} align={align} side={side} sideOffset={sideOffset}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>organizations</DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {organizations.map((org) =>
        itemVariant === "iconTile" ? (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            disabled={switchOrg.isPending}
          >
            <div className="flex size-6 items-center justify-center rounded-sm border border-border">
              <BankIcon className="size-3.5 shrink-0" />
            </div>
            <span className="truncate min-w-0 flex-1">{org.name}</span>
            {org.id === activeOrgId && <CheckIcon className="size-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            key={org.id}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => handleSwitch(org.id)}
            disabled={switchOrg.isPending}
          >
            <span className="truncate min-w-0 flex-1">{org.name}</span>
            {org.id === activeOrgId && <CheckIcon className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ),
      )}
      {organizations.length === 0 && <DropdownMenuItem disabled>no organizations</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className={cn(
          "flex items-center gap-2 cursor-pointer",
          itemVariant === "iconTile" && "gap-2 p-2",
        )}
        render={<Link to="/orgs/new" />}
      >
        {itemVariant === "iconTile" ? (
          <>
            <div className="flex size-6 items-center justify-center rounded-md border border-border bg-background">
              <PlusIcon className="size-4" />
            </div>
            <span className="font-medium text-muted-foreground">new organization</span>
          </>
        ) : (
          <>
            <PlusIcon className="h-3.5 w-3.5" />
            new organization
          </>
        )}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

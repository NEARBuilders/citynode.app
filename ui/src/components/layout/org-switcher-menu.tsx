import { Link } from "@tanstack/react-router";
import { Building2, Check, Plus } from "lucide-react";
import type { Organization } from "@/app";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
      <DropdownMenuLabel className="text-xs text-muted-foreground">organizations</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {organizations.map((org) =>
        itemVariant === "iconTile" ? (
          <DropdownMenuItem
            key={org.id}
            className="gap-2 p-2"
            onClick={() => handleSwitch(org.id)}
            disabled={switchOrg.isPending}
          >
            <div className="flex size-6 items-center justify-center rounded-sm border border-border">
              <Building2 className="size-3.5 shrink-0" />
            </div>
            <span className="truncate min-w-0 flex-1">{org.name}</span>
            {org.id === activeOrgId && <Check className="size-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            key={org.id}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => handleSwitch(org.id)}
            disabled={switchOrg.isPending}
          >
            <span className="truncate min-w-0 flex-1">{org.name}</span>
            {org.id === activeOrgId && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ),
      )}
      {organizations.length === 0 && (
        <DropdownMenuItem disabled className="text-muted-foreground">
          no organizations
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className={itemVariant === "iconTile" ? "gap-2 p-2" : undefined}>
        <Link to="/orgs/new" className="flex items-center gap-2 cursor-pointer">
          {itemVariant === "iconTile" ? (
            <>
              <div className="flex size-6 items-center justify-center rounded-md border border-border bg-background">
                <Plus className="size-4" />
              </div>
              <span className="font-medium text-muted-foreground">new organization</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              new organization
            </>
          )}
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

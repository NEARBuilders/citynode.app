import { BuildingsIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAppTranslation } from "@/i18n/runtime";
import type { Organization } from "@/lib/queries/organizations";
import { OrgMark } from "./org-mark";
import { useSwitchOrganization } from "./use-switch-organization";

interface OrgSwitcherMenuContentProps {
  organizations: Organization[];
  activeOrgId?: string | null;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  itemVariant?: "plain" | "iconTile";
}

export function OrgSwitcherMenuContent({
  organizations,
  activeOrgId,
  isLoading,
  error,
  onRetry,
  className = "w-60",
  align = "end",
  side,
  sideOffset,
  itemVariant = "plain",
}: OrgSwitcherMenuContentProps) {
  const translate = useAppTranslation();
  const switchOrg = useSwitchOrganization();

  const handleSwitch = (orgId: string) => {
    if (orgId === activeOrgId || switchOrg.isPending) return;
    switchOrg.mutate(orgId);
  };

  return (
    <DropdownMenuContent className={className} align={align} side={side} sideOffset={sideOffset}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{translate("common.organizations")}</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            disabled={switchOrg.isPending || org.status !== "active"}
            data-testid={`org-switcher-item-${org.id}`}
          >
            {itemVariant === "iconTile" && <OrgMark name={org.name} size="sm" />}
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {org.status !== "active" && (
              <span className="text-xs text-muted-foreground">{org.status}</span>
            )}
            {org.id === activeOrgId && <CheckIcon className="text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        {isLoading && organizations.length === 0 && (
          <DropdownMenuItem disabled data-testid="org-switcher-loading">
            {translate("org.loading")}
          </DropdownMenuItem>
        )}
        {error && (
          <DropdownMenuItem onClick={onRetry} data-testid="org-switcher-retry">
            {translate("org.loadFailedRetry")}
          </DropdownMenuItem>
        )}
        {!isLoading && !error && organizations.length === 0 && (
          <DropdownMenuItem disabled>{translate("org.empty")}</DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link to="/orgs/new" />} data-testid="org-switcher-new">
        <PlusIcon />
        {translate("org.new")}
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link to="/orgs" />} data-testid="org-switcher-all">
        <BuildingsIcon />
        {translate("org.all")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

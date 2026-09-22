import { ChevronsUpDown, Layers, UsersRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { WorkspaceTeam } from "@/lib/team-workspace";

interface SidebarTeamSwitcherProps {
  teams: WorkspaceTeam[];
  activeTeamId: string | null;
  isPending: boolean;
  onSelect: (teamId: string | null) => void;
}

export function SidebarTeamSwitcher({
  teams,
  activeTeamId,
  isPending,
  onSelect,
}: SidebarTeamSwitcherProps) {
  if (teams.length === 0) return null;
  const activeTeam = teams.find((team) => team.id === activeTeamId);

  const select = (teamId: string | null) => {
    if (teamId === (activeTeam?.id ?? null) || isPending) return;
    onSelect(teamId);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              data-testid="team-switcher"
              disabled={isPending}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UsersRound className="size-4" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{activeTeam?.name ?? "All areas"}</span>
                <span className="truncate text-xs text-muted-foreground">team workspace</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              operate as team
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {teams.map((team) => (
              <DropdownMenuCheckboxItem
                key={team.id}
                checked={team.id === activeTeam?.id}
                disabled={isPending}
                onSelect={() => select(team.id)}
                data-testid={`team-switcher-item-${team.id}`}
              >
                <span className="truncate">{team.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!activeTeam}
              disabled={isPending}
              onSelect={() => select(null)}
              data-testid="team-switcher-item-all"
            >
              <Layers className="size-3.5 mr-2" />
              All areas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

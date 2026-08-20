import { Link } from "@tanstack/react-router";
import { NearBranding } from "@/components/layout/near-branding";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SidebarItem } from "./nav-items";

interface AppSidebarProps {
  items: SidebarItem[];
  appName: string;
  isActive: (item: SidebarItem) => boolean;
}

export function AppSidebar({ items, appName, isActive }: AppSidebarProps) {
  return (
    <aside className="hidden sm:flex h-full shrink-0 flex-col items-center border-r border-border bg-card overflow-hidden transition-all duration-300 w-16">
      <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-1.5 py-4 min-h-0 min-w-16">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/"
              preload="intent"
              aria-label={`${appName} home`}
              className="mb-3 flex items-center justify-center w-10 h-10 border-2 border-outset border-border-strong bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 text-foreground"
                aria-label={`${appName} logo`}
              >
                <title>{appName}</title>
                <circle cx="12" cy="12" r="10" />
              </svg>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{appName}</TooltipContent>
        </Tooltip>

        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          const linkClass = cn(
            "flex items-center justify-center w-10 h-10 border-2 border-outset border-border-strong shadow-sm transition-all duration-200 ease-out hover:shadow-md",
            active ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
          );

          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <Link to={item.to} preload="intent" className={linkClass}>
                  <Icon className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="shrink-0 w-full flex justify-center py-3 bg-card border-t border-border z-10">
        <NearBranding />
      </div>
    </aside>
  );
}

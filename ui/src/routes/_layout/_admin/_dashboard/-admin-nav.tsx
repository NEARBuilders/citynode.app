import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Fuel, Gavel, LayoutDashboard, Network, Settings } from "lucide-react";
import { Badge } from "@/components";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "nodes", to: "/admin/nodes", icon: Network },
  { label: "proposals", to: "/admin/proposals", icon: Gavel },
  { label: "tenants", to: "/admin/tenants", icon: Building2 },
  { label: "relayer", to: "/admin/relayer", icon: Fuel },
  { label: "system", to: "/admin/system", icon: Settings },
] as const;

export function AdminNav({ pendingProposalCount }: { pendingProposalCount?: number }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = (to: string) =>
    to === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(to);

  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map(({ label, to, icon: Icon }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium border-2 border-outset border-border-strong rounded-[10px] shadow-sm transition-shadow duration-200 hover:shadow-md",
              active ? "bg-foreground text-background" : "bg-card text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {label === "proposals" && pendingProposalCount !== undefined && (
              <Badge
                variant={active ? "outline" : "secondary"}
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px]"
              >
                {pendingProposalCount}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

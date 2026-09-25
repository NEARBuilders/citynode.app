import {
  BuildingsIcon,
  GasPumpIcon,
  GavelIcon,
  GearIcon,
  SquaresFourIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Badge, Button } from "@/components";

const NAV_ITEMS = [
  { label: "dashboard", to: "/admin", icon: SquaresFourIcon },
  { label: "nodes", to: "/admin/nodes", icon: TreeStructureIcon },
  { label: "proposals", to: "/admin/proposals", icon: GavelIcon },
  { label: "tenants", to: "/admin/tenants", icon: BuildingsIcon },
  { label: "relayer", to: "/admin/relayer", icon: GasPumpIcon },
  { label: "system", to: "/admin/system", icon: GearIcon },
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
          <Button
            key={to}
            variant={active ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link to={to} />}
          >
            <Icon />
            {label}
            {label === "proposals" && pendingProposalCount !== undefined && (
              <Badge variant={active ? "outline" : "secondary"} className="ml-1">
                {pendingProposalCount}
              </Badge>
            )}
          </Button>
        );
      })}
    </nav>
  );
}

import { Building2, Home, Landmark, Network, Shield } from "lucide-react";

export type SidebarRole = "anon" | "member" | "admin";

export interface SidebarItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  roleRequired: SidebarRole;
}

export const NAV_ITEMS: SidebarItem[] = [
  { icon: Home, label: "dashboard", to: "/dashboard", roleRequired: "anon" },
  { icon: Network, label: "my node", to: "/dashboard/node", roleRequired: "member" },
  { icon: Landmark, label: "stake", to: "/stake", roleRequired: "anon" },
  { icon: Building2, label: "orgs", to: "/orgs", roleRequired: "anon" },
  { icon: Shield, label: "admin", to: "/admin", roleRequired: "admin" },
];

export function getUserRole(isAuthenticated: boolean, isAdmin: boolean): SidebarRole {
  if (isAdmin) return "admin";
  if (isAuthenticated) return "member";
  return "anon";
}

export function filterSidebarByRole(items: SidebarItem[], userRole: SidebarRole): SidebarItem[] {
  return items.filter((item) => {
    if (item.roleRequired === "anon") return true;
    if (item.roleRequired === "member" && userRole !== "anon") return true;
    if (item.roleRequired === "admin" && userRole === "admin") return true;
    return false;
  });
}

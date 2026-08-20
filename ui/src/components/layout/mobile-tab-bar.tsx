import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { NearBranding } from "@/components/layout/near-branding";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SidebarItem } from "./nav-items";

interface MobileTabBarProps {
  items: SidebarItem[];
  isActive: (item: SidebarItem) => boolean;
}

export function MobileTabBar({ items, isActive }: MobileTabBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const primaryTabs = items.filter((item) => item.roleRequired !== "admin").slice(0, 3);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 sm:hidden border-t border-border bg-card z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const active = tabActive(item.to);
          return (
            <Link
              key={item.label}
              to={item.to}
              preload="intent"
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 p-2 min-w-[56px] rounded-[10px] transition-colors duration-200",
                active
                  ? "text-foreground bg-foreground/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 p-2 text-muted-foreground hover:text-foreground transition-colors min-w-[48px]"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px]">menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="!max-w-[300px] p-0 flex flex-col">
            <SheetHeader className="!px-4 !pt-4 !pb-2 shrink-0">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 py-2 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      preload="intent"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm font-medium transition-colors",
                        active
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="shrink-0 px-4 py-2 border-t border-border">
              <NearBranding />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

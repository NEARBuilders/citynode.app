import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BetaBanner } from "@/components/layout/beta-banner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    if (!isNavigating) {
      setShowBar(false);
      return;
    }
    const t = setTimeout(() => setShowBar(true), 150);
    return () => clearTimeout(t);
  }, [isNavigating]);

  return (
    <TooltipProvider>
      <div
        className="h-dvh w-full flex flex-col overflow-hidden bg-background text-foreground"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <BetaBanner />

        {showBar && (
          <div className="fixed top-0 left-0 right-0 h-[2px] z-50 overflow-hidden pointer-events-none">
            <div className="h-full bg-foreground animate-progress-bar" style={{ width: "100%" }} />
          </div>
        )}

        <Outlet />
      </div>
    </TooltipProvider>
  );
}

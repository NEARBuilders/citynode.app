import { Link, useRouterState } from "@tanstack/react-router";
import type { ClientRuntimeConfig } from "@/app";
import { getAccount, getActiveRuntime, getAppName } from "@/app";
import { UserNav } from "./user-nav";

interface AppHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}

export function AppHeader({ runtimeConfig }: AppHeaderProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appName = getAppName(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);
  const account = getAccount(runtimeConfig);

  return (
    <header className="shrink-0 bg-card/50 border-b border-border transition-all duration-200 overflow-hidden h-12">
      <div className="flex items-center justify-between px-4 sm:px-6 h-12">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono min-w-0">
          <Link
            aria-label={`${appName} home`}
            className="sm:hidden flex items-center justify-center w-8 h-8 border-2 border-outset border-border-strong bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
            to="/"
            preload="intent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 text-foreground"
              aria-label={`${appName} logo`}
            >
              <title>{appName}</title>
              <circle cx="12" cy="12" r="10" />
            </svg>
          </Link>

          <div className="hidden sm:flex items-center gap-2">
            <span>{runtime?.accountId ?? account}</span>
            <span>/</span>
            <span className="truncate">
              {pathname === "/" ? "home" : pathname.slice(1).split("/").join(" / ")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <UserNav />
        </div>
      </div>
    </header>
  );
}

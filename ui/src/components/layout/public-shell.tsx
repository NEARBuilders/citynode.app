import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { getAppName } from "@/app";
import { NearBranding } from "@/components/layout/near-branding";
import { UserNav } from "./user-nav";

interface PublicShellProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  children: ReactNode;
  footer?: ReactNode;
}

export function PublicShell({ runtimeConfig, children, footer }: PublicShellProps) {
  const appName = getAppName(runtimeConfig);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="shrink-0 bg-card/50 border-b border-border transition-all duration-200 overflow-hidden h-12">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 h-12">
          <Link
            to="/"
            aria-label={`${appName} home`}
            className="flex shrink-0 items-center justify-center w-10 h-10 transition-opacity duration-200 hover:opacity-70"
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

          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <UserNav />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        {footer && (
          <footer className="shrink-0 flex items-center justify-center py-6">{footer}</footer>
        )}
      </div>
    </div>
  );
}

export function PublicShellFooter() {
  return <NearBranding />;
}

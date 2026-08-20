import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { getAccount, getActiveRuntime, getAppName } from "@/app";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface AppHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}

export function AppHeader({ runtimeConfig }: AppHeaderProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appName = getAppName(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);
  const account = getAccount(runtimeConfig);
  const segments = pathname === "/" ? [] : pathname.slice(1).split("/").filter(Boolean);

  return (
    <header className="shrink-0 bg-card/50 border-b border-border transition-all duration-200 overflow-hidden h-12">
      <div className="flex items-center gap-2 px-4 sm:px-6 h-12 min-w-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />

        <Link
          aria-label={`${appName} home`}
          className="sm:hidden flex items-center justify-center w-8 h-8 shrink-0 border-2 border-outset border-border-strong bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
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

        <Breadcrumb className="hidden sm:block min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <span>{runtime?.accountId ?? account}</span>
            </BreadcrumbItem>
            {segments.length === 0 ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>home</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              segments.map((segment, index) => {
                const isLast = index === segments.length - 1;
                const href = `/${segments.slice(0, index + 1).join("/")}`;
                return (
                  <Fragment key={href}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{segment}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={href}>{segment}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}

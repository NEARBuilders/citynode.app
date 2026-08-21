import { useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { getAccount, getActiveRuntime } from "@/app";
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
  const runtime = getActiveRuntime(runtimeConfig);
  const account = getAccount(runtimeConfig);
  const segments = pathname === "/" ? [] : pathname.slice(1).split("/").filter(Boolean);

  return (
    <header className="shrink-0 bg-card/50 border-b border-border transition-all duration-200 overflow-hidden h-12">
      <div className="flex items-center gap-2 px-4 sm:px-6 h-12 min-w-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />

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

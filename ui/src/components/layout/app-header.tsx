import { useRouterState } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
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
import { UserNav } from "./user-nav";

interface AppHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  activeTeamName?: string;
}

export function AppHeader({ runtimeConfig, activeTeamName }: AppHeaderProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const runtime = getActiveRuntime(runtimeConfig);
  const account = getAccount(runtimeConfig);
  const segments = pathname === "/" ? [] : pathname.slice(1).split("/").filter(Boolean);

  return (
    <header className="shrink-0 bg-card/50 border-b border-border transition-colors duration-200 overflow-hidden h-12">
      <div className="flex items-center gap-2 px-4 sm:px-6 h-12 min-w-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />

        <Breadcrumb className="hidden sm:block min-w-0 flex-1">
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
        {activeTeamName && (
          <div
            className="ml-auto flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground"
            data-testid="workspace-active-team"
          >
            <UsersRound className="size-3.5 shrink-0" />
            <span className="truncate">
              operating as <span className="font-medium text-foreground">{activeTeamName}</span>
            </span>
          </div>
        )}
        <div className={activeTeamName ? "shrink-0" : "ml-auto shrink-0"}>
          <UserNav showOrgSwitcher={false} />
        </div>
      </div>
    </header>
  );
}

import { UsersIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { getAppName, useApiClient } from "@/app";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { resolveGuide } from "@/lib/docs-guides";
import { adminNodeDetailQueryOptions, nodeBySlugQueryOptions } from "@/lib/queries/nodes";
import { placeResolutionQueryOptions } from "@/lib/queries/places";
import { crumbsFor } from "./breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { useIdentity } from "./use-identity";
import { useTeamWorkspace } from "./use-team-workspace";
import { UserNav } from "./user-nav";

interface AppHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  actions?: ReactNode;
}

export function AppHeader({ runtimeConfig, actions }: AppHeaderProps) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const { user, organizations } = useIdentity();
  const { data: workspace } = useTeamWorkspace(!!user);
  const activeTeamName = workspace?.activeTeam?.name;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({
    select: (s) => {
      const value = (s.location.search as Record<string, unknown>).tab;
      return typeof value === "string" ? value : undefined;
    },
  });
  const adminNodeId = /^\/admin\/nodes\/([^/]+)/.exec(pathname)?.[1];
  const { data: adminNode } = useQuery({
    ...adminNodeDetailQueryOptions(apiClient, adminNodeId ?? ""),
    enabled: false,
  });
  const publicMatch = /^\/(n|places)\/([^/]+)/.exec(pathname);
  const publicKind = publicMatch?.[1];
  const publicSlug = publicMatch?.[2] ? safeDecode(publicMatch[2]) : "";
  const { data: publicNode } = useQuery({
    ...nodeBySlugQueryOptions(apiClient, publicKind === "n" ? publicSlug : ""),
    enabled: false,
  });
  const { data: publicPlace } = useQuery({
    ...placeResolutionQueryOptions(apiClient, publicKind === "places" ? publicSlug : ""),
    enabled: false,
  });
  const detailName = adminNodeId
    ? adminNode?.summary.node.name
    : publicKind === "n"
      ? publicNode?.name
      : publicKind === "places"
        ? publicPlace?.place.name
        : undefined;
  const crumbs = crumbsFor(
    pathname,
    {
      tab,
      detailName,
      appName: getAppName(runtimeConfig),
      orgName: (slug) => organizations.find((org) => org.slug === slug)?.name,
      guideTitle: (slug) =>
        pathname.startsWith("/docs/") ? resolveGuide(slug, locale)?.title : undefined,
    },
    translate,
  );

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background">
      <div className="flex h-14 min-w-0 items-center gap-3 px-4 sm:px-6">
        <SidebarTrigger />

        <Breadcrumb className="min-w-0 flex-1" data-testid="app-header-breadcrumb">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 && <BreadcrumbSeparator className="hidden sm:flex" />}
                  <BreadcrumbItem className={isLast ? "min-w-0" : "hidden sm:inline-flex"}>
                    {isLast || !crumb.to ? (
                      <BreadcrumbPage>
                        <span className="block truncate">{crumb.label}</span>
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>

        {activeTeamName && (
          <div
            className="flex min-w-0 max-w-40 shrink items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground sm:max-w-64"
            data-testid="workspace-active-team"
            title={translate("identity.workingAsNamed", { name: activeTeamName })}
          >
            <UsersIcon className="size-4 shrink-0" />
            <span className="truncate">
              {translate("identity.workingAsNamed", { name: activeTeamName })}
            </span>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <ThemeToggle />
          <UserNav />
        </div>
      </div>
    </header>
  );
}

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

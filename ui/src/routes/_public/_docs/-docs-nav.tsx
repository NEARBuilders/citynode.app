import { CaretDownIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { type GuideSummary, listGuides } from "@/lib/docs-guides";

type StaticDocsPath = "/docs" | "/docs/build" | "/skill";

const STATIC_TABS: { to: StaticDocsPath; label: AppMessageId; slug: string }[] = [
  { to: "/docs", label: "docs.nav.overview", slug: "overview" },
  { to: "/docs/build", label: "docs.nav.builders", slug: "builders" },
  { to: "/skill", label: "docs.skill", slug: "skill" },
];

const GUIDES_TAB = "guides";

function useActivePath() {
  return useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") || "/" });
}

function activeTab(pathname: string, guides: GuideSummary[]): string | null {
  const staticTab = STATIC_TABS.find((tab) => tab.to === pathname);
  if (staticTab) return staticTab.slug;
  if (guides.some((guide) => pathname === `/docs/${guide.slug}`)) return GUIDES_TAB;
  return null;
}

export function DocsTabs() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const pathname = useActivePath();
  const guides = listGuides(locale);
  const active = activeTab(pathname, guides);

  return (
    <nav
      aria-label={translate("docs.nav.label")}
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      data-testid="docs.tabs"
    >
      <Tabs value={active}>
        <TabsList variant="line">
          {STATIC_TABS.map((tab) => (
            <TabsTrigger
              key={tab.slug}
              value={tab.slug}
              nativeButton={false}
              render={<Link to={tab.to} preload="intent" activeOptions={{ exact: true }} />}
              data-testid={`docs.nav-${tab.slug}`}
            >
              {translate(tab.label)}
            </TabsTrigger>
          ))}
          {guides.length > 0 ? (
            <DocsGuidesMenu
              guides={guides}
              pathname={pathname}
              active={active === GUIDES_TAB}
              label={translate("docs.nav.guides")}
            />
          ) : null}
        </TabsList>
      </Tabs>
    </nav>
  );
}

function DocsGuidesMenu({
  guides,
  pathname,
  active,
  label,
}: {
  guides: GuideSummary[];
  pathname: string;
  active: boolean;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="docs.nav-group-guides"
        className={cn(
          "relative inline-flex h-full items-center gap-1 px-0.5 text-sm font-medium whitespace-nowrap transition-colors",
          "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
          active
            ? "text-foreground after:opacity-100"
            : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
        )}
      >
        {label}
        <CaretDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {guides.map((guide) => (
          <DropdownMenuItem
            key={guide.slug}
            className="whitespace-normal"
            data-testid={`docs.nav-${guide.slug}`}
            aria-current={pathname === `/docs/${guide.slug}` ? "page" : undefined}
            render={<Link to="/docs/$guide" params={{ guide: guide.slug }} />}
          >
            <span className="wrap-anywhere">{guide.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

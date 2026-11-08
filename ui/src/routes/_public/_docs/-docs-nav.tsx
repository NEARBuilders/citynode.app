import { CaretDownIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { listGuides } from "@/lib/docs-guides";

type StaticDocsPath = "/docs" | "/docs/build" | "/skill";

type DocsNavItem =
  | { kind: "static"; to: StaticDocsPath; label: string; slug: string; path: string }
  | {
      kind: "guide";
      to: "/docs/$guide";
      params: { guide: string };
      label: string;
      slug: string;
      path: string;
    };

type DocsNavGroup = {
  id: string;
  heading: string;
  items: DocsNavItem[];
};

const STATIC_NAV: {
  id: string;
  label: AppMessageId;
  items: { to: StaticDocsPath; label: AppMessageId; slug: string }[];
}[] = [
  {
    id: "start",
    label: "docs.nav.start",
    items: [{ to: "/docs", label: "docs.nav.overview", slug: "overview" }],
  },
  {
    id: "build",
    label: "docs.nav.build",
    items: [
      { to: "/docs/build", label: "docs.nav.builders", slug: "builders" },
      { to: "/skill", label: "docs.skill", slug: "skill" },
    ],
  },
];

function useActivePath() {
  return useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") || "/" });
}

function useDocsNavGroups(): DocsNavGroup[] {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const groups: DocsNavGroup[] = STATIC_NAV.map((group) => ({
    id: group.id,
    heading: translate(group.label),
    items: group.items.map((item) => ({
      kind: "static" as const,
      to: item.to,
      label: translate(item.label),
      slug: item.slug,
      path: item.to,
    })),
  }));
  const guides = listGuides(locale);
  if (guides.length > 0) {
    groups.push({
      id: "guides",
      heading: translate("docs.nav.guides"),
      items: guides.map((guide) => ({
        kind: "guide" as const,
        to: "/docs/$guide",
        params: { guide: guide.slug },
        label: guide.title,
        slug: guide.slug,
        path: `/docs/${guide.slug}`,
      })),
    });
  }
  return groups;
}

function DocsNavLink({
  item,
  pathname,
  className,
}: {
  item: DocsNavItem;
  pathname: string;
  className: string;
}) {
  const active = pathname === item.path;
  const classes = cn(
    className,
    active
      ? "bg-muted font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
  if (item.kind === "guide") {
    return (
      <Link
        to={item.to}
        params={item.params}
        preload="intent"
        activeOptions={{ exact: true }}
        data-testid={`docs.nav-${item.slug}`}
        className={classes}
      >
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      to={item.to}
      preload="intent"
      activeOptions={{ exact: true }}
      data-testid={`docs.nav-${item.slug}`}
      className={classes}
    >
      {item.label}
    </Link>
  );
}

export function DocsSideNav() {
  const translate = useAppTranslation();
  const pathname = useActivePath();
  const groups = useDocsNavGroups();
  return (
    <nav aria-label={translate("docs.nav.label")} className="flex flex-col gap-6">
      {groups.map((group) => (
        <div
          key={group.id}
          className="flex flex-col gap-1"
          data-testid={`docs.nav-group-${group.id}`}
        >
          <div className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.heading}
          </div>
          {group.items.map((item) => (
            <DocsNavLink
              key={item.path}
              item={item}
              pathname={pathname}
              className="rounded-lg px-3 py-1.5 text-sm transition-colors"
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function DocsMobileNav() {
  const translate = useAppTranslation();
  const pathname = useActivePath();
  const groups = useDocsNavGroups();
  const current = groups.flatMap((group) => group.items).find((item) => item.path === pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-full justify-between" />}
        aria-label={translate("docs.nav.label")}
        data-testid="docs.nav-menu"
      >
        {current ? current.label : translate("common.docs")}
        <CaretDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {groups.map((group) => (
          <DropdownMenuGroup key={group.id} data-testid={`docs.nav-group-${group.id}`}>
            <DropdownMenuLabel>{group.heading}</DropdownMenuLabel>
            {group.items.map((item) =>
              item.kind === "guide" ? (
                <DropdownMenuItem
                  key={item.path}
                  render={<Link to={item.to} params={item.params} />}
                >
                  {item.label}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={item.path} render={<Link to={item.to} />}>
                  {item.label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

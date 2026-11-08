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
import { useAppTranslation } from "@/i18n/runtime";

type DocsPath = "/docs" | "/docs/build" | "/skill";

const DOCS_NAV: {
  label: AppMessageId;
  items: { to: DocsPath; label: AppMessageId; slug: string }[];
}[] = [
  {
    label: "docs.nav.start",
    items: [{ to: "/docs", label: "docs.nav.overview", slug: "overview" }],
  },
  {
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

export function DocsSideNav() {
  const translate = useAppTranslation();
  const pathname = useActivePath();
  return (
    <nav aria-label={translate("docs.nav.label")} className="flex flex-col gap-6">
      {DOCS_NAV.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {translate(group.label)}
          </div>
          {group.items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                preload="intent"
                activeOptions={{ exact: true }}
                data-testid={`docs.nav-${item.slug}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {translate(item.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DocsMobileNav() {
  const translate = useAppTranslation();
  const pathname = useActivePath();
  const current = DOCS_NAV.flatMap((group) => group.items).find((item) => item.to === pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-full justify-between" />}
        aria-label={translate("docs.nav.label")}
        data-testid="docs.nav-menu"
      >
        {current ? translate(current.label) : translate("common.docs")}
        <CaretDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {DOCS_NAV.map((group) => (
          <DropdownMenuGroup key={group.label}>
            <DropdownMenuLabel>{translate(group.label)}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem key={item.to} render={<Link to={item.to} />}>
                {translate(item.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppTranslation } from "@/i18n/runtime";
import type { FeatureArea } from "@/lib/feature-areas";
import { areasAllowPath } from "@/lib/team-workspace";

export type CommunitySection = "overview" | "content" | "onboarding" | "bulletin" | "proposals";

export type CommunityNavSection = CommunitySection | "settings";

export function CommunityNav({
  active,
  nodeId,
  tenantId,
  canManage,
  allowedAreas = null,
  replace = false,
  testIds = {},
}: {
  active: CommunityNavSection;
  nodeId: string;
  tenantId?: string | null;
  canManage?: boolean;
  allowedAreas?: readonly FeatureArea[] | null;
  replace?: boolean;
  testIds?: Partial<Record<CommunityNavSection, string>>;
}) {
  const translate = useAppTranslation();
  const items: { value: CommunityNavSection; label: string; path: string; link: ReactElement }[] = [
    {
      value: "overview",
      label: translate("common.overview"),
      path: "/dashboard/node",
      link: <Link to="/dashboard/node" search={{ nodeId }} />,
    },
    {
      value: "content",
      label: translate("events.title"),
      path: `/nodes/${nodeId}/content`,
      link: (
        <Link
          to="/nodes/$nodeId/content"
          params={{ nodeId }}
          search={{ tab: "events" }}
          replace={replace}
        />
      ),
    },
    {
      value: "onboarding",
      label: translate("org.onboarding"),
      path: `/nodes/${nodeId}/content`,
      link: (
        <Link
          to="/nodes/$nodeId/content"
          params={{ nodeId }}
          search={{ tab: "onboarding" }}
          replace={replace}
        />
      ),
    },
    {
      value: "proposals",
      label: translate("common.proposals"),
      path: "/dashboard/node/proposals",
      link: <Link to="/dashboard/node/proposals" search={{ nodeId }} />,
    },
    ...(canManage
      ? [
          {
            value: "bulletin" as const,
            label: translate("bulletin.title"),
            path: `/nodes/${nodeId}/content`,
            link: (
              <Link
                to="/nodes/$nodeId/content"
                params={{ nodeId }}
                search={{ tab: "bulletin" }}
                replace={replace}
              />
            ),
          },
        ]
      : []),
    ...(tenantId && canManage
      ? [
          {
            value: "settings" as const,
            label: translate("tenant.settings"),
            path: `/tenant/${tenantId}`,
            link: <Link to="/tenant/$tenantId" params={{ tenantId }} search={{ nodeId }} />,
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label={translate("nav.myCommunity")}
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <Tabs value={active}>
        <TabsList variant="line">
          {items
            .filter((item) => areasAllowPath(allowedAreas, item.path))
            .map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                nativeButton={false}
                render={item.link}
                data-testid={testIds[item.value] ?? `community-nav-${item.value}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

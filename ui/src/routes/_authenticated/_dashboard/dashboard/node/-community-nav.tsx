import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppTranslation } from "@/i18n/runtime";

export type CommunitySection = "overview" | "content" | "onboarding" | "bulletin" | "proposals";

export type CommunityNavSection = CommunitySection | "settings";

export function CommunityNav({
  active,
  nodeId,
  tenantId,
  canManage,
  replace = false,
  testIds = {},
}: {
  active: CommunityNavSection;
  nodeId: string;
  tenantId?: string | null;
  canManage?: boolean;
  replace?: boolean;
  testIds?: Partial<Record<CommunityNavSection, string>>;
}) {
  const translate = useAppTranslation();
  const items: { value: CommunityNavSection; label: string; link: ReactElement }[] = [
    {
      value: "overview",
      label: translate("common.overview"),
      link: <Link to="/dashboard/node" search={{ nodeId }} />,
    },
    {
      value: "content",
      label: translate("events.title"),
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
      link: <Link to="/dashboard/node/proposals" search={{ nodeId }} />,
    },
    ...(canManage
      ? [
          {
            value: "bulletin" as const,
            label: translate("bulletin.title"),
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
          {items.map((item) => (
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

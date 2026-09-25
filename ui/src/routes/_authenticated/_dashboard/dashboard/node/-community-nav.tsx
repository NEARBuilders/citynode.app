import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CommunitySection = "overview" | "content" | "onboarding" | "proposals";

export function CommunityNav({
  active,
  nodeId,
  tenantId,
  canManage,
}: {
  active: CommunitySection;
  nodeId: string;
  tenantId?: string | null;
  canManage?: boolean;
}) {
  const items: { value: CommunitySection | "settings"; label: string; link: ReactElement }[] = [
    {
      value: "overview",
      label: "Overview",
      link: <Link to="/dashboard/node" search={{ nodeId }} />,
    },
    {
      value: "content",
      label: "Events & profile",
      link: <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "events" }} />,
    },
    {
      value: "onboarding",
      label: "Onboarding",
      link: <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "onboarding" }} />,
    },
    {
      value: "proposals",
      label: "Proposals",
      link: <Link to="/dashboard/node/proposals" search={{ nodeId }} />,
    },
    ...(tenantId && canManage
      ? [
          {
            value: "settings" as const,
            label: "Community settings",
            link: <Link to="/tenant/$tenantId" params={{ tenantId }} />,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="My community" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <Tabs value={active}>
        <TabsList variant="line">
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              nativeButton={false}
              render={item.link}
              data-testid={`community-nav-${item.value}`}
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

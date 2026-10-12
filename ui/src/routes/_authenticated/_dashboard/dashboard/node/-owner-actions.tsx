import {
  CalendarPlusIcon,
  type Icon,
  MapPinIcon,
  QrCodeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { SectionHeader } from "@/components";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";

interface OwnerAction {
  id: string;
  icon: Icon;
  title: string;
  description: string;
  link: ReactElement;
}

export function OwnerActions({
  nodeId,
  tenantId,
  showPayouts,
}: {
  nodeId: string;
  tenantId: string | null;
  showPayouts: boolean;
}) {
  const translate = useAppTranslation();
  const actions: OwnerAction[] = [
    {
      id: "add-event",
      icon: CalendarPlusIcon,
      title: translate("events.add"),
      description: translate("ownerActions.eventHint"),
      link: <Link to="/nodes/$nodeId/events/new" params={{ nodeId }} />,
    },
    {
      id: "qr",
      icon: QrCodeIcon,
      title: translate("ownerActions.qr"),
      description: translate("ownerActions.qrHint"),
      link: <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "onboarding" }} />,
    },
    ...(tenantId
      ? [
          {
            id: "profile",
            icon: MapPinIcon,
            title: translate("ownerActions.profile"),
            description: translate("ownerActions.profileHint"),
            link: (
              <Link
                to="/tenant/$tenantId"
                params={{ tenantId }}
                search={{ nodeId }}
                hash="profile"
              />
            ),
          },
        ]
      : []),
    ...(showPayouts
      ? [
          {
            id: "payouts",
            icon: WalletIcon,
            title: translate("ownerActions.payouts"),
            description: translate("ownerActions.payoutsHint"),
            link: <Link to="/dashboard/node" search={{ nodeId }} hash="payouts" />,
          },
        ]
      : []),
  ];

  return (
    <section className="flex flex-col gap-6" data-testid="dashboard-node.owner-actions">
      <SectionHeader title={translate("ownerActions.title")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <Item
            key={action.id}
            variant="outline"
            className="items-start"
            render={action.link}
            data-testid={`dashboard-node.action-${action.id}`}
          >
            <ItemMedia variant="icon">
              <action.icon />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{action.title}</ItemTitle>
              <ItemDescription>{action.description}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </div>
    </section>
  );
}

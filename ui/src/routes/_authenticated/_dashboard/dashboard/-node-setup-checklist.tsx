import {
  CalendarPlusIcon,
  CaretRightIcon,
  CheckCircleIcon,
  type Icon,
  MapPinIcon,
  QrCodeIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactElement } from "react";
import { Button, SectionHeader } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import type { NodeSetupStep, NodeSetupStepId } from "./-next-steps";

const SETUP_ICONS: Record<NodeSetupStepId, Icon> = {
  map: MapPinIcon,
  profile: UserCircleIcon,
  event: CalendarPlusIcon,
  qr: QrCodeIcon,
};

export function NodeSetupChecklist({
  steps,
  communityName,
  nodeId,
  tenantId,
}: {
  steps: NodeSetupStep[];
  communityName: string;
  nodeId: string;
  tenantId: string;
}) {
  const translate = useAppTranslation();
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  const link = (id: NodeSetupStepId): ReactElement => {
    switch (id) {
      case "map":
      case "profile":
        return (
          <Link to="/tenant/$tenantId" params={{ tenantId }} search={{ nodeId }} hash="profile" />
        );
      case "event":
        return <Link to="/nodes/$nodeId/events/new" params={{ nodeId }} />;
      case "qr":
        return (
          <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "onboarding" }} />
        );
    }
  };

  return (
    <section className="flex flex-col gap-6" data-testid="home-node-setup">
      <SectionHeader
        title={translate("setup.title", { name: communityName })}
        description={translate("setup.progress", { done, total: steps.length })}
      />
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        style={{ "--setup-progress": `${(done / steps.length) * 100}%` } as CSSProperties}
        aria-hidden
      >
        <div className="h-full w-(--setup-progress) rounded-full bg-success transition-all" />
      </div>
      <ItemGroup>
        {steps.map((step) => {
          const StepIcon = step.done ? CheckCircleIcon : SETUP_ICONS[step.id];
          const isNext = step.id === next?.id;
          return (
            <Item
              key={step.id}
              variant={isNext ? "muted" : "outline"}
              render={isNext ? undefined : link(step.id)}
              data-testid={`home-setup-${step.id}`}
              data-done={step.done}
            >
              <ItemMedia variant="icon">
                <StepIcon weight={step.done ? "fill" : "regular"} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{translate(`setup.${step.id}.title`)}</ItemTitle>
                <ItemDescription>{translate(`setup.${step.id}.hint`)}</ItemDescription>
              </ItemContent>
              <ItemActions className={isNext ? "w-full sm:w-auto" : undefined}>
                {isNext ? (
                  <Button className="w-full sm:w-auto" nativeButton={false} render={link(step.id)}>
                    {translate(`setup.${step.id}.action`)}
                  </Button>
                ) : (
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                )}
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </section>
  );
}

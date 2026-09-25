import {
  BuildingsIcon,
  CoinsIcon,
  CompassIcon,
  FingerprintIcon,
  GearSixIcon,
  type Icon,
  NetworkIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { pluginPath } from "@/app";
import { Button } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { NextStep, NextStepId } from "./-next-steps";

const STEP_ICONS: Record<NextStepId, Icon> = {
  "save-account": FingerprintIcon,
  "create-org": BuildingsIcon,
  "choose-org": UsersThreeIcon,
  "start-community": RocketLaunchIcon,
  "open-community": NetworkIcon,
  "community-settings": GearSixIcon,
  admin: ShieldCheckIcon,
  stake: CoinsIcon,
  explore: CompassIcon,
};

function stepLink(step: NextStep, tenantId: string | null): ReactElement {
  switch (step.id) {
    case "save-account":
      return <Link to={pluginPath("/settings/auth-methods")} />;
    case "create-org":
      return <Link to="/orgs/new" />;
    case "choose-org":
      return <Link to="/orgs" />;
    case "start-community":
      return <Link to="/apply" />;
    case "open-community":
      return <Link to="/dashboard/node" />;
    case "community-settings":
      return <Link to="/tenant/$tenantId" params={{ tenantId: tenantId ?? "" }} />;
    case "admin":
      return <Link to="/admin" />;
    case "stake":
      return <Link to="/stake" />;
    case "explore":
      return <Link to="/explore" />;
  }
}

export function NextStepsList({
  steps,
  tenantId,
  primary,
}: {
  steps: NextStep[];
  tenantId: string | null;
  primary: boolean;
}) {
  return (
    <ItemGroup data-testid="home-next-steps">
      {steps.map((step, index) => {
        const StepIcon = STEP_ICONS[step.id];
        const isPrimary = primary && index === 0;
        return (
          <Item key={step.id} variant="outline" data-testid={`home-step-${step.id}`}>
            <ItemMedia variant="icon">
              <StepIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{step.title}</ItemTitle>
              <ItemDescription>{step.description}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size="sm"
                variant={isPrimary ? "default" : "outline"}
                nativeButton={false}
                render={stepLink(step, tenantId)}
              >
                {step.actionLabel}
              </Button>
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

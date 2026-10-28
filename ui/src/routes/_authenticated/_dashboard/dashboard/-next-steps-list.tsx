import {
  CaretRightIcon,
  CoinsIcon,
  CompassIcon,
  FingerprintIcon,
  type Icon,
  NetworkIcon,
  PlusCircleIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
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
  "choose-org": UsersThreeIcon,
  "start-community": RocketLaunchIcon,
  "open-community": NetworkIcon,
  payouts: WalletIcon,
  "launch-node": PlusCircleIcon,
  admin: ShieldCheckIcon,
  stake: CoinsIcon,
  explore: CompassIcon,
};

interface StepProps {
  step: NextStep;
}

function stepLink(step: NextStep) {
  switch (step.id) {
    case "save-account":
      return <Link to={pluginPath("/settings/auth-methods")} />;
    case "choose-org":
      return <Link to="/orgs" />;
    case "start-community":
      return <Link to="/apply" />;
    case "open-community":
      return <Link to="/dashboard/node" />;
    case "payouts":
      return <Link to="/dashboard/node" hash="payouts" />;
    case "launch-node":
      return <Link to="/apply" />;
    case "admin":
      return <Link to="/admin/proposals" />;
    case "stake":
      return <Link to="/stake" />;
    case "explore":
      return <Link to="/explore" />;
  }
}

function FeaturedStep({ step }: StepProps) {
  const StepIcon = STEP_ICONS[step.id];
  return (
    <Item variant="muted" data-testid={`home-step-${step.id}`}>
      <ItemMedia variant="icon">
        <StepIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{step.title}</ItemTitle>
        <ItemDescription>{step.description}</ItemDescription>
      </ItemContent>
      <ItemActions className="w-full sm:w-auto">
        <Button className="w-full sm:w-auto" nativeButton={false} render={stepLink(step)}>
          {step.actionLabel}
        </Button>
      </ItemActions>
    </Item>
  );
}

function StepRow({ step }: StepProps) {
  const StepIcon = STEP_ICONS[step.id];
  return (
    <Item variant="outline" render={stepLink(step)} data-testid={`home-step-${step.id}`}>
      <ItemMedia variant="icon">
        <StepIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{step.title}</ItemTitle>
        <ItemDescription>{step.description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

export function NextStepsList({ steps, primary }: { steps: NextStep[]; primary: boolean }) {
  const [first, ...rest] = steps;
  const featured = primary && first ? first : null;
  const rows = featured ? rest : steps;
  return (
    <ItemGroup data-testid="home-next-steps">
      {featured && <FeaturedStep step={featured} />}
      {rows.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ItemGroup>
  );
}

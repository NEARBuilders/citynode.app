import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { useApiClient } from "@/app";
import { EmptyState } from "@/components";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import type { StakingValidators } from "@/lib/queries/nodes";
import { StakeNoValidator } from "./-stake-no-validator";
import { StakeSkeleton } from "./-stake-skeleton";
import { StakeValidatorList } from "./-stake-validator-list";

type ApiClient = ReturnType<typeof useApiClient>;
type Node = Awaited<ReturnType<ApiClient["getNode"]>>;
type Validator = StakingValidators["validators"][number];
type ChildNode = Awaited<ReturnType<ApiClient["listChildren"]>>[number];

export function StakeNodeContent({
  aside,
  childNodes,
  node,
  nodeLoading,
  onSelectValidator,
  selectedValidatorId,
  stakingLoading,
  validators,
  via,
}: {
  aside: ReactNode;
  childNodes: ChildNode[];
  node: Node | undefined;
  nodeLoading: boolean;
  onSelectValidator: (validatorId: string) => void;
  selectedValidatorId: string | null;
  stakingLoading: boolean;
  validators: Validator[];
  via: StakingValidators["via"];
}) {
  const translate = useAppTranslation();
  if (nodeLoading || stakingLoading) return <StakeSkeleton />;
  if (!node) {
    return (
      <EmptyState
        icon={MagnifyingGlassIcon}
        title={translate("community.notFound")}
        description={translate("community.notFoundDescription")}
        action={
          <Button nativeButton={false} render={<Link to="/stake" />}>
            {translate("community.seeAll")}
          </Button>
        }
      />
    );
  }
  if (validators.length === 0) {
    return (
      <StakeNoValidator
        name={node.name}
        childNodes={childNodes.map(({ id, name, slug }) => ({ id, name, slug }))}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
        {via && (
          <p className="text-sm text-muted-foreground" data-testid="stake.via">
            {translate("stake.viaNamed", { name: via.name })}
          </p>
        )}
        <StakeValidatorList
          validators={validators}
          selectedValidatorId={selectedValidatorId}
          onSelect={onSelectValidator}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:col-span-2 lg:self-start">
        {aside}
      </div>
    </div>
  );
}

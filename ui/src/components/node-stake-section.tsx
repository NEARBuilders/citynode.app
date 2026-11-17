import type { InferClientOutputs } from "@orpc/client";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ApiClient } from "@/app";
import { SectionHeader } from "@/components/layout/section-header";
import { StakePoolCard } from "@/components/stake-pool-card";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import type { StakingValidators } from "@/lib/queries/nodes";

type Node = InferClientOutputs<ApiClient>["getNodeSummary"]["node"];

export function NodeStakeSection({
  node,
  validators,
  via,
}: {
  node: Node;
  validators: StakingValidators["validators"];
  via: StakingValidators["via"];
}) {
  const translate = useAppTranslation();
  const description =
    validators.length === 0
      ? translate("stake.noValidator")
      : via
        ? translate("stake.inheritsValidator", { community: node.name, source: via.name })
        : translate("stake.backNamed", { name: node.name });

  return (
    <section className="flex flex-col gap-6" data-testid="node-stake">
      <SectionHeader
        title={translate("common.stake")}
        description={description}
        action={
          validators.length > 0 && (
            <Button
              variant="outline"
              nativeButton={false}
              data-testid="node-stake-link"
              render={<Link to="/stake" search={{ nodeId: node.id }} />}
            >
              {via
                ? translate("stake.viaNamed", { name: via.name })
                : translate("stake.toNamed", { name: node.name })}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )
        }
      />
      {validators.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {validators.map((validator) => (
            <StakePoolCard key={validator.id} validator={validator} />
          ))}
        </div>
      )}
    </section>
  );
}

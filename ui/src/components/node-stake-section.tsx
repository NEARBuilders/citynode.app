import type { InferClientOutputs } from "@orpc/client";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ApiClient } from "@/app";
import { SectionHeader } from "@/components/layout/section-header";
import { StakePoolCard } from "@/components/stake-pool-card";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeQueryKeys } from "@/lib/queries/nodes";

type Node = InferClientOutputs<ApiClient>["getNodeSummary"]["node"];
type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];

export function NodeStakeSection({
  node,
  children,
  validators,
  sourceNodeId,
  apiClient,
}: {
  node: Node;
  children: Node[];
  gateway: string | null;
  validators: Validator[];
  sourceNodeId: string;
  apiClient: Pick<ApiClient, "getNode" | "getSubtree">;
}) {
  const translate = useAppTranslation();
  const hasOwnValidator = validators.some((validator) => validator.nodeId === node.id);
  const validatorNodeIds = new Set(validators.map((validator) => validator.nodeId));
  const childrenWithValidators = children.filter((child) => validatorNodeIds.has(child.id));
  const { data: source } = useQuery({
    queryKey: [...nodeQueryKeys.details(), node.id, "staking-source", sourceNodeId],
    enabled: validators.length > 0 && !hasOwnValidator,
    staleTime: 30_000,
    queryFn: async () => {
      const [sourceNode, subtree] = await Promise.all([
        apiClient.getNode({ nodeId: sourceNodeId }),
        apiClient.getSubtree({ nodeId: node.id }),
      ]);
      return { sourceNode, inherited: !subtree.some((entry) => entry.id === sourceNodeId) };
    },
  });

  const target = hasOwnValidator
    ? node
    : childrenWithValidators.length === 0
      ? source?.sourceNode
      : undefined;
  const scope =
    source?.inherited && source.sourceNode
      ? translate("stake.inheritedFrom", { name: source.sourceNode.name })
      : hasOwnValidator || (source && !source.inherited)
        ? translate("stake.nodePoolsHint")
        : null;

  return (
    <section className="flex flex-col gap-6" data-testid="node-stake">
      <SectionHeader
        title={translate("common.stake")}
        description={
          validators.length === 0
            ? translate("stake.noValidator")
            : hasOwnValidator
              ? translate("stake.backNamed", { name: node.name ?? "" })
              : childrenWithValidators.length > 0
                ? translate("stake.inheritedNamed", { name: node.name ?? "" })
                : scope
        }
        action={target && <StakeLink node={target} />}
      />
      {validators.length > 0 && (
        <>
          {childrenWithValidators.length > 0 && (
            <ul className="flex flex-col gap-2">
              {childrenWithValidators.map((child) => (
                <li key={child.id}>
                  <Item
                    variant="outline"
                    size="sm"
                    render={<Link to="/stake" search={{ nodeId: child.id }} />}
                  >
                    <ItemContent>
                      <ItemTitle>
                        <span className="capitalize">{child.name}</span>
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <ArrowRightIcon className="text-muted-foreground" />
                    </ItemActions>
                  </Item>
                </li>
              ))}
            </ul>
          )}
          {scope && (hasOwnValidator || childrenWithValidators.length > 0) && (
            <p className="text-sm text-muted-foreground">{scope}</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {validators.map((validator) => (
              <StakePoolCard key={validator.id} validator={validator} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function StakeLink({ node }: { node: Pick<Node, "id" | "name"> }) {
  const translate = useAppTranslation();
  return (
    <Button
      variant="outline"
      nativeButton={false}
      data-testid="node-stake-link"
      render={<Link to="/stake" search={{ nodeId: node.id }} />}
    >
      {translate("stake.toNamed", { name: node.name })}
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
  );
}

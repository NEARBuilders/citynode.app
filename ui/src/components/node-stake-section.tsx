import type { InferClientOutputs } from "@orpc/client";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/app";
import { StakePoolCard } from "@/components/stake-pool-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nodeQueryKeys } from "@/lib/queries/nodes";

type Node = InferClientOutputs<ApiClient>["getNodeSummary"]["node"];
type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];

export function NodeStakeSection({
  node,
  children,
  gateway,
  validators,
  sourceNodeId,
  apiClient,
}: {
  node: Node;
  children: Node[];
  gateway: string;
  validators: Validator[];
  sourceNodeId: string;
  apiClient: Pick<ApiClient, "getNode" | "getSubtree">;
}) {
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

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Stake</h2>
      {validators.length === 0 ? (
        <p className="text-sm text-muted-foreground">This node doesn&apos;t run a validator yet.</p>
      ) : (
        <>
          {hasOwnValidator ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {node.name} runs its own validator pool.
              </p>
              <StakeLink node={node} gateway={gateway} />
            </div>
          ) : childrenWithValidators.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {node.name} doesn&apos;t run its own validator — stake to a city that does.
              </p>
              <div>
                {childrenWithValidators.map((child) => (
                  <a
                    key={child.id}
                    href={`https://${child.slug}.${gateway}/stake?nodeId=${encodeURIComponent(child.id)}`}
                    className="group flex items-center gap-4 border-b border-border px-2 py-4 last:border-0 transition-colors hover:bg-muted/50"
                  >
                    <span className="capitalize text-base font-semibold text-foreground group-hover:underline">
                      {child.name}
                    </span>
                    <ArrowRightIcon className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            source?.sourceNode && <StakeLink node={source.sourceNode} gateway={gateway} />
          )}
          {source?.inherited && source.sourceNode ? (
            <Card className="gap-1 p-4">
              <p className="text-sm">Stake inherited from {source.sourceNode.name}.</p>
              <p className="text-xs text-muted-foreground">
                Available pools are supplied by ancestor nodes.
              </p>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              {hasOwnValidator || (source && !source.inherited)
                ? "Pools across this node and its descendants."
                : "Available staking pools."}
            </p>
          )}
          {validators.map((validator) => (
            <StakePoolCard key={validator.id} validator={validator} />
          ))}
        </>
      )}
    </section>
  );
}

function StakeLink({
  node,
  gateway,
}: {
  node: Pick<Node, "id" | "name" | "slug">;
  gateway: string;
}) {
  return (
    <Button
      nativeButton={false}
      render={
        <a href={`https://${node.slug}.${gateway}/stake?nodeId=${encodeURIComponent(node.id)}`}>
          Stake to {node.name}
          <ArrowRightIcon />
        </a>
      }
    />
  );
}

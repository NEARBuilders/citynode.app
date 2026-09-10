import type { useApiClient } from "@/app";
import { Card } from "@/components";
import { StakeDirectory } from "./-stake-directory";
import { StakeNoValidator } from "./-stake-no-validator";
import { StakeSkeleton } from "./-stake-skeleton";
import { StakeValidatorList } from "./-stake-validator-list";

type ApiClient = ReturnType<typeof useApiClient>;
type Node = Awaited<ReturnType<ApiClient["getNode"]>>;
type Validator = Awaited<ReturnType<ApiClient["resolveStakingValidators"]>>["validators"][number];
type ChildNode = Awaited<ReturnType<ApiClient["listChildren"]>>[number];

export function StakeNodeContent({
  childNodes,
  directoryLoading,
  directoryNodes,
  gateway,
  hasNodeSelection,
  isInherited,
  node,
  nodeLoading,
  onSelectValidator,
  selectedValidatorId,
  sourceNode,
  stakingLoading,
  validators,
}: {
  childNodes: ChildNode[];
  directoryLoading: boolean;
  directoryNodes: {
    id: string;
    kind: string;
    name: string;
    slug: string;
    hostname: string | null;
  }[];
  gateway: string;
  hasNodeSelection: boolean;
  isInherited: boolean;
  node: Node | undefined;
  nodeLoading: boolean;
  onSelectValidator: (validatorId: string) => void;
  selectedValidatorId: string | null;
  sourceNode: Node | undefined;
  stakingLoading: boolean;
  validators: Validator[];
}) {
  if (!hasNodeSelection) {
    return <StakeDirectory nodes={directoryNodes} gateway={gateway} isLoading={directoryLoading} />;
  }
  if (nodeLoading || stakingLoading) return <StakeSkeleton />;
  if (!node) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Node not found.</p>
      </Card>
    );
  }
  if (validators.length === 0) {
    return (
      <StakeNoValidator childNodes={childNodes.map(({ id, name, slug }) => ({ id, name, slug }))} />
    );
  }
  return (
    <div className="space-y-4">
      {isInherited && sourceNode && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            {node.name} doesn&apos;t run its own validator — staking to{" "}
            <span className="font-semibold text-foreground">{sourceNode.name}</span>
            &apos;s inherited validator.
          </p>
        </Card>
      )}
      <StakeValidatorList
        validators={validators}
        selectedValidatorId={selectedValidatorId}
        onSelect={onSelectValidator}
      />
    </div>
  );
}

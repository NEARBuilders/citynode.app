import { NodeDirectory } from "@/components";

type DirectoryNode = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  hostname: string | null;
};

export function StakeDirectory({
  gateway,
  isLoading,
  nodes,
}: {
  gateway: string;
  isLoading: boolean;
  nodes: DirectoryNode[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <p className="text-sm text-muted-foreground">Select a city to stake to.</p>
      <NodeDirectory
        nodes={nodes}
        gateway={gateway}
        linkTo="/stake"
        linkSearch={(node) => ({ node: node.slug })}
        isLoading={isLoading}
        emptyMessage="No city nodes available yet."
      />
    </div>
  );
}

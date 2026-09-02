import { Badge, Skeleton } from "@/components";

export interface NodeDirectoryNode {
  id: string;
  name: string;
  slug: string;
  kind: string;
  hostname?: string | null;
}

interface NodeDirectoryProps {
  nodes: NodeDirectoryNode[];
  gateway: string;
  validatorNodeIds?: ReadonlySet<string>;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function NodeDirectory({
  nodes,
  gateway,
  validatorNodeIds,
  isLoading = false,
  emptyMessage = "No nodes yet.",
}: NodeDirectoryProps) {
  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border py-4 last:border-0"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <table className="w-full text-sm">
      <tbody>
        {nodes.map((node) => {
          const hostname = node.hostname ?? `${node.slug}.${gateway}`;
          return (
            <tr
              key={node.id}
              className="group border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="p-0">
                <a href={`https://${hostname}/`} className="flex items-center gap-4 px-2 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold capitalize text-foreground group-hover:underline">
                      {node.name}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {hostname}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {node.kind}
                    </Badge>
                    {validatorNodeIds?.has(node.id) && (
                      <Badge variant="outline" className="text-[10px]">
                        validator
                      </Badge>
                    )}
                  </div>
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

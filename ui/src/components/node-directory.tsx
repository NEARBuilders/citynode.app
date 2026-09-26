import { Link } from "@tanstack/react-router";
import { buildTenantUrl } from "everything-dev/ui/tenant";
import { NodeDirectorySkeleton } from "./node-directory-skeleton";
import { Badge } from "./ui/badge";

export interface NodeDirectoryNode {
  id: string;
  name: string;
  slug: string;
  kind: string;
  parentId?: string | null;
  hostname?: string | null;
}

interface NodeDirectoryProps {
  nodes: NodeDirectoryNode[];
  gateway: string;
  validatorNodeIds?: ReadonlySet<string>;
  isLoading?: boolean;
  emptyMessage?: string;
  linkTo?: "/stake" | "/n/$slug";
  linkSearch?: (node: NodeDirectoryNode) => { node?: string } | undefined;
}

export function NodeDirectory({
  nodes,
  gateway,
  validatorNodeIds,
  isLoading = false,
  emptyMessage = "No nodes yet.",
  linkTo,
  linkSearch,
}: NodeDirectoryProps) {
  if (isLoading) {
    return <NodeDirectorySkeleton />;
  }

  if (nodes.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <table className="w-full text-sm">
      <tbody>
        {nodes.map((node) => {
          const hostname = node.hostname ?? `${node.slug}.${gateway}`;
          const href = buildTenantUrl(hostname, gateway, { path: "/" }) ?? `https://${hostname}/`;
          const className = "flex items-center gap-4 px-2 py-4";
          const content = (
            <>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold capitalize text-foreground group-hover:underline">
                  {node.name}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">{hostname}</div>
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
            </>
          );
          return (
            <tr
              key={node.id}
              className="group border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="p-0">
                {linkTo === "/n/$slug" ? (
                  <Link
                    to="/n/$slug"
                    params={{ slug: node.slug }}
                    search={{ parentId: node.parentId ?? undefined }}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : linkTo ? (
                  <Link to={linkTo} search={linkSearch?.(node) ?? {}} className={className}>
                    {content}
                  </Link>
                ) : (
                  <a href={href} className={className}>
                    {content}
                  </a>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

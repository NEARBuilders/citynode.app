import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components";

type ChildNode = { id: string; name: string; slug: string };

export function StakeNoValidator({ childNodes }: { childNodes: ChildNode[] }) {
  return (
    <Card className="p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        This node doesn&apos;t run a validator — browse child nodes that might.
      </p>
      {childNodes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {childNodes.map((child) => (
            <Link
              key={child.id}
              to="/stake"
              search={{ node: child.slug, nodeId: child.id }}
              className="inline-flex h-10 items-center justify-between gap-2 rounded-[8px] border-2 border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="capitalize">{child.name}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No child nodes either.</p>
      )}
    </Card>
  );
}

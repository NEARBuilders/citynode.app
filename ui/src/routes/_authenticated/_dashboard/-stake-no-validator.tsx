import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button, Card } from "@/components";

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
            <Button
              key={child.id}
              variant="outline"
              nativeButton={false}
              className="justify-between"
              render={<Link to="/stake" search={{ node: child.slug, nodeId: child.id }} />}
            >
              <span className="capitalize">{child.name}</span>
              <ArrowRightIcon />
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No child nodes either.</p>
      )}
    </Card>
  );
}

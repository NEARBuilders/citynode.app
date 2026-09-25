import type { useApiClient } from "@/app";
import { Badge, Card } from "@/components";

type ApiClient = ReturnType<typeof useApiClient>;
type ReviewHistoryResult = Awaited<ReturnType<ApiClient["proposals"]["getReviewHistory"]>>;
export type ReviewHistoryEntry = ReviewHistoryResult["data"][number];

export function ReviewHistoryCard({ entry }: { entry: ReviewHistoryEntry }) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{entry.actorLabel || entry.actor}</p>
          <p className="font-mono text-xs text-muted-foreground">{entry.entityId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entry.action === "rejected" ? "destructive" : "default"}>
            {entry.action}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(entry.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      {entry.details !== null && (
        <pre className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </Card>
  );
}

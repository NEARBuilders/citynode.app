import type { useApiClient } from "@/app";
import { Badge, LocalDate } from "@/components";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { humanize, RawJsonDisclosure } from "../-admin-ui";

type ApiClient = ReturnType<typeof useApiClient>;
type ReviewHistoryResult = Awaited<ReturnType<ApiClient["proposals"]["getReviewHistory"]>>;
export type ReviewHistoryEntry = ReviewHistoryResult["data"][number];

export function ReviewHistoryCard({ entry }: { entry: ReviewHistoryEntry }) {
  return (
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle>{entry.actorLabel || entry.actor}</ItemTitle>
        <ItemDescription>
          <span className="font-mono">{entry.entityId}</span> ·{" "}
          <LocalDate value={entry.createdAt} format="relative" />
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant={entry.action === "rejected" ? "destructive" : "success"}>
          {humanize(entry.action)}
        </Badge>
      </ItemActions>
      {entry.details !== null && (
        <div className="basis-full">
          <RawJsonDisclosure value={entry.details} label="details" />
        </div>
      )}
    </Item>
  );
}

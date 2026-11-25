import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";

export type Collectible = Awaited<
  ReturnType<ApiClient["getMyCollectibles"]>
>["collectibles"][number];

export function collectibleKey(organizationId: string, eventId: string | null) {
  return `${organizationId}:${eventId ?? "membership"}`;
}

export function ShardDogCollectible({
  collectible,
  testId,
}: {
  collectible: Collectible;
  testId: string;
}) {
  const translate = useAppTranslation();
  if (collectible.status === "awarded" && collectible.viewUrl) {
    const viewUrl = collectible.viewUrl;
    return (
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={(props) => (
          <a {...props} href={viewUrl} target="_blank" rel="noopener noreferrer" />
        )}
        data-testid={`${testId}-view`}
      >
        {translate("collectibles.viewInShardDog")}
        <ArrowSquareOutIcon />
      </Button>
    );
  }
  return (
    <span className="text-sm text-muted-foreground" data-testid={`${testId}-${collectible.status}`}>
      {translate(
        collectible.status === "needs_account"
          ? "collectibles.needsAccount"
          : "collectibles.pending",
      )}
    </span>
  );
}

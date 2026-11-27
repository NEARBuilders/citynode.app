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

function ShardDogLink({
  href,
  variant,
  testId,
  label,
}: {
  href: string;
  variant?: "outline";
  testId: string;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      nativeButton={false}
      render={(props) => <a {...props} href={href} target="_blank" rel="noopener noreferrer" />}
      data-testid={testId}
    >
      {label}
      <ArrowSquareOutIcon />
    </Button>
  );
}

export function ShardDogViewLink({ href, testId }: { href: string; testId: string }) {
  const translate = useAppTranslation();
  return (
    <ShardDogLink
      href={href}
      variant="outline"
      testId={testId}
      label={translate("collectibles.viewInShardDog")}
    />
  );
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
    return <ShardDogViewLink href={collectible.viewUrl} testId={`${testId}-view`} />;
  }
  if (collectible.status === "claim" && collectible.claimUrl) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <ShardDogLink
          href={collectible.claimUrl}
          testId={`${testId}-claim`}
          label={translate("collectibles.claimInShardDog")}
        />
        <span className="max-w-56 text-xs text-muted-foreground">
          {translate("collectibles.claimHint")}
        </span>
      </div>
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

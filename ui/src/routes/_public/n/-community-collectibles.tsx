import { ArrowUpRightIcon, SealCheckIcon, TicketIcon } from "@phosphor-icons/react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { type ApiClient, useApiClient } from "@/app";
import { LocalDate, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";

type Collectible = Awaited<ReturnType<ApiClient["getNodeCollectibles"]>>["collectibles"][number];

export function nodeCollectiblesQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: ["node-collectibles", nodeId],
    queryFn: () => apiClient.getNodeCollectibles({ nodeId }),
    retry: false,
    staleTime: 60_000,
  });
}

export function CommunityCollectibles({ nodeId, nodeName }: { nodeId: string; nodeName: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { data } = useQuery(nodeCollectiblesQueryOptions(apiClient, nodeId));
  const collectibles = data?.collectibles ?? [];

  if (collectibles.length === 0) return null;

  return (
    <section className="flex flex-col gap-6" data-testid="node-page.collectibles">
      <SectionHeader
        title={translate("collectibles.title")}
        description={translate("collectibles.descriptionNamed", { name: nodeName })}
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collectibles.map((collectible) => (
          <li key={`${collectible.kind}:${collectible.eventId ?? ""}`}>
            <CollectibleCard collectible={collectible} nodeName={nodeName} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CollectibleCard({
  collectible,
  nodeName,
}: {
  collectible: Collectible;
  nodeName: string;
}) {
  const translate = useAppTranslation();
  const membership = collectible.kind === "membership";
  const Icon = membership ? SealCheckIcon : TicketIcon;
  const title =
    collectible.name ??
    (membership
      ? translate("collectibles.membershipNamed", { name: nodeName })
      : (collectible.eventTitle ?? translate("collectibles.event")));

  return (
    <div
      className="flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4"
      data-testid={`node-page.collectible.${collectible.kind}`}
    >
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {collectible.imageUrl ? (
          <img src={collectible.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-7 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-base font-medium text-foreground">{title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>
            {membership ? translate("collectibles.membership") : translate("collectibles.event")}
          </span>
          {collectible.eventStartsAt && <LocalDate value={collectible.eventStartsAt} />}
        </div>
        <a
          href={collectible.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-sm font-medium text-foreground hover:underline"
          data-testid="node-page.collectible-view"
        >
          {translate("collectibles.view")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

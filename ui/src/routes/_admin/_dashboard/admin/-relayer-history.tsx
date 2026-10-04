import type { RelayHistoryResponseT } from "better-near-auth";
import { Badge, LocalDate, SectionHeader } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { humanize, ListSkeleton } from "./-admin-ui";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  return "warning" as const;
}

export function RelayerHistory({
  history,
  isLoading,
}: {
  history: RelayHistoryResponseT | null | undefined;
  isLoading: boolean;
}) {
  const translate = useAppTranslation();
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("admin.relayer.recent")} />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : !history?.transactions.length ? (
        <p className="text-sm text-muted-foreground">{translate("admin.relayer.empty")}</p>
      ) : (
        <ItemGroup data-testid="admin-relayer-history">
          {history.transactions.slice(0, 8).map((tx) => (
            <Item key={tx.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <span className="font-mono">{tx.txHash.slice(0, 12)}…</span>
                </ItemTitle>
                <ItemDescription>
                  <span className="font-mono break-all">{tx.senderId}</span> ·{" "}
                  <LocalDate value={tx.createdAt} format="relative" />
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={statusVariant(tx.status)}>{humanize(tx.status, translate)}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

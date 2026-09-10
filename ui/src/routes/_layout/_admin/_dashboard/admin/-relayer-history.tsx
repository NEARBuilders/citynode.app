import type { RelayHistoryResponseT } from "better-near-auth";
import { Badge, CardContent } from "@/components";

export function RelayerHistory({
  history,
  isLoading,
}: {
  history: RelayHistoryResponseT | null | undefined;
  isLoading: boolean;
}) {
  return (
    <CardContent className="p-6 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Recent relays</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !history?.transactions.length ? (
        <p className="text-sm text-muted-foreground">
          No relayed transactions yet. Tenant republish + app metadata writes will appear here.
        </p>
      ) : (
        <ul className="space-y-2 text-xs font-mono">
          {history.transactions.slice(0, 8).map((tx) => (
            <li
              key={tx.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1 last:border-b-0"
            >
              <span>{tx.txHash.slice(0, 12)}…</span>
              <span className="text-muted-foreground">{tx.senderId}</span>
              <Badge
                variant={
                  tx.status === "completed"
                    ? "default"
                    : tx.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="text-[10px]"
              >
                {tx.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  );
}

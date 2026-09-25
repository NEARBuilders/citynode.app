import { Badge, Button } from "@/components";
import type { RelayerInfoData } from "@/lib/use-relayer";
import { RelayerStatusBody } from "./-relayer-status-body";

export function RelayerStatus({
  info,
  isLoading,
  isFetching,
  onRefresh,
}: {
  info: RelayerInfoData | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const statusLabel = !info
    ? "not configured"
    : info.enabled
      ? "active"
      : info.accountId
        ? "needs funding"
        : "initialising";
  const statusVariant =
    !info || info.enabled ? "default" : info.accountId ? "destructive" : "secondary";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Status</h2>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {info?.mode && <Badge variant="outline">{info.mode}</Badge>}
        </div>
      </div>

      <RelayerStatusBody info={info} isLoading={isLoading} />

      <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
        refresh
      </Button>
    </div>
  );
}

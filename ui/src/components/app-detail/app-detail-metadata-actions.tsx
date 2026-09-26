import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MetadataAction = { isPending: boolean; mutate: () => void };

export function AppDetailMetadataActions({
  publish,
  sign,
  relay,
  relayEnabled,
  delegatePayload,
}: {
  publish: MetadataAction;
  sign: MetadataAction;
  relay: MetadataAction;
  relayEnabled?: boolean;
  delegatePayload: string | null;
}) {
  const isAnyPending = publish.isPending || sign.isPending || relay.isPending;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => publish.mutate()} disabled={isAnyPending} size="sm">
          {publish.isPending ? "Publishing..." : "Publish now"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => sign.mutate()} disabled={isAnyPending}>
          {sign.isPending ? "Signing..." : "Sign delegate"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => relay.mutate()}
          disabled={!relayEnabled || !delegatePayload || isAnyPending}
        >
          {relay.isPending ? "Relaying..." : "Relay payload"}
        </Button>
      </div>

      {delegatePayload && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Signed delegate payload
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={async () => {
                await navigator.clipboard.writeText(delegatePayload);
                toast.success("Payload copied");
              }}
            >
              <Copy size={10} />
              copy
            </Button>
          </div>
          <pre
            className="overflow-x-auto rounded border border-border bg-muted/10 p-3 font-mono text-foreground whitespace-pre-wrap break-all"
            style={{ fontSize: 10, lineHeight: "1.5", maxHeight: 140 }}
          >
            {delegatePayload}
          </pre>
        </div>
      )}
    </>
  );
}

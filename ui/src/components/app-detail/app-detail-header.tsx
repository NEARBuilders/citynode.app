import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BASE_RUNTIME, type RegistryAppDetail } from "./app-detail-types";

export function AppDetailHeader({
  accountId,
  gatewayId,
  app,
}: {
  accountId: string;
  gatewayId: string;
  app: RegistryAppDetail;
}) {
  const [copiedUri, setCopiedUri] = useState(false);
  const isTenant = app.extends === BASE_RUNTIME;
  const bosUri = `bos://${accountId}/${gatewayId}`;
  const displayTitle = app.metadata?.title ?? `${accountId} / ${gatewayId}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            app.status === "ready" ? "bg-success" : "bg-destructive"
          }`}
        />
        {isTenant && <Badge variant="outline">tenant</Badge>}
        {app.metadata?.claimedBy ? (
          <Badge variant="secondary">claimed by {app.metadata.claimedBy}</Badge>
        ) : (
          <Badge variant="outline">unclaimed</Badge>
        )}
      </div>

      <h1 className="text-xl font-bold text-foreground break-all">{displayTitle}</h1>

      <Button
        variant="ghost"
        size="xs"
        className="self-start"
        onClick={async () => {
          await navigator.clipboard.writeText(bosUri);
          setCopiedUri(true);
          toast.success("Copied bos:// address");
          setTimeout(() => setCopiedUri(false), 2000);
        }}
      >
        <code className="font-mono text-xs">{bosUri}</code>
        {copiedUri ? (
          <CheckIcon size={11} className="shrink-0 text-success" />
        ) : (
          <CopyIcon size={11} className="shrink-0" />
        )}
      </Button>

      {app.metadata?.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{app.metadata.description}</p>
      )}

      <div className="flex gap-3 flex-wrap">
        {app.metadata?.repoUrl && (
          <a
            href={app.metadata.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            repository
          </a>
        )}
        {app.metadata?.homepageUrl && (
          <a
            href={app.metadata.homepageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            homepage
          </a>
        )}
        <a
          href={app.canonicalConfigUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
        >
          FastKV config
        </a>
      </div>
    </div>
  );
}

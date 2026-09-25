import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { highlightJson } from "@/lib/json-highlight";
import { AppDetailSectionLabel } from "./app-detail-section-label";
import type { RegistryAppDetail } from "./app-detail-types";

export function AppDetailConfig({ app }: { app: RegistryAppDetail }) {
  const configQuery = useQuery({
    queryKey: ["fastkv-config", app.canonicalConfigUrl],
    queryFn: async () => {
      const res = await fetch(app.canonicalConfigUrl);
      if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
      return res.json() as Promise<Record<string, unknown>>;
    },
    staleTime: 60_000,
    enabled: Boolean(app.canonicalConfigUrl),
  });

  if (!app.canonicalConfigUrl) return null;

  return (
    <section className="space-y-2">
      <AppDetailSectionLabel>FastKV config</AppDetailSectionLabel>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 px-3.5 py-2 border-b border-border flex items-center justify-between">
          <a
            href={app.canonicalConfigUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors underline"
          >
            {app.canonicalKey}
          </a>
          {configQuery.data && (
            <Button
              variant="ghost"
              size="xs"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(configQuery.data, null, 2));
                toast.success("Config copied");
              }}
            >
              copy
            </Button>
          )}
        </div>
        <div className="p-0">
          {configQuery.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading...</div>
          ) : configQuery.error ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Failed to load config.{" "}
              <Button variant="link" size="xs" onClick={() => configQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <pre className="overflow-x-auto p-4 font-mono text-sm text-foreground leading-relaxed whitespace-pre bg-foreground text-background">
              {highlightJson(JSON.stringify(configQuery.data, null, 2))}
            </pre>
          )}
        </div>
      </div>
    </section>
  );
}

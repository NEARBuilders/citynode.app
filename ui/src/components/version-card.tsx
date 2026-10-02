import { useQuery } from "@tanstack/react-query";
import { Badge, SectionHeader } from "@/components";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";

interface VersionEndpointResponse {
  fingerprint?: string;
  slots?: Record<string, string>;
  watch?: { lastOutcome?: string };
}

const OUTCOME_LABELS: Record<string, { label: AppMessageId; tone: "info" | "success" | "danger" }> =
  {
    clean: { label: "version.clean", tone: "success" },
    swapped: { label: "version.swapped", tone: "info" },
    "swap-failed": { label: "version.swapFailed", tone: "danger" },
    "pointer-unreachable": { label: "version.pointerUnreachable", tone: "danger" },
  };

export function VersionCard() {
  const translate = useAppTranslation();
  const query = useQuery({
    queryKey: ["deployed-version"],
    queryFn: async (): Promise<VersionEndpointResponse> => {
      const response = await fetch("/.well-known/version");
      if (!response.ok) throw new Error(`version endpoint returned ${response.status}`);
      return response.json();
    },
    refetchInterval: 30_000,
  });

  const version = query.data;
  const outcome = version?.watch?.lastOutcome;
  const outcomeMeta = outcome ? OUTCOME_LABELS[outcome] : undefined;

  return (
    <div data-testid="admin-version-card" className="rounded-lg border bg-background p-4">
      <SectionHeader title={translate("version.title")} sectionTestId="admin-version-heading" />
      {query.isLoading ? (
        <p className="text-muted-foreground text-sm">{translate("common.loading")}</p>
      ) : query.isError || !version?.fingerprint ? (
        <p className="text-muted-foreground text-sm">{translate("version.unreachable")}</p>
      ) : (
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">{translate("version.fingerprint")}</dt>
            <dd className="font-mono">{version.fingerprint}</dd>
            {outcomeMeta && (
              <Badge
                variant={
                  outcomeMeta.tone === "danger"
                    ? "destructive"
                    : outcomeMeta.tone === "success"
                      ? "success"
                      : "secondary"
                }
              >
                {translate(outcomeMeta.label)}
              </Badge>
            )}
          </div>
          {Object.keys(version.slots ?? {}).length > 0 && (
            <div>
              <dt className="text-muted-foreground">{translate("version.slots")}</dt>
              <dd className="mt-1 space-y-0.5">
                {Object.entries(version.slots ?? {}).map(([slot, pin]) => (
                  <div key={slot} className="flex gap-2 font-mono text-xs">
                    <span className="text-muted-foreground">{slot}</span>
                    <span>{pin}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

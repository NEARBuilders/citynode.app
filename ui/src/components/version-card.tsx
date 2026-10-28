import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
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
  return (
    <div data-testid="admin-version-card" className="rounded-lg border bg-background p-4">
      <SectionHeader title={translate("version.title")} sectionTestId="admin-version-heading" />
      <VersionDetails className="mt-2" />
    </div>
  );
}

export function useDeployedVersion() {
  return useQuery({
    queryKey: ["deployed-version"],
    queryFn: async (): Promise<VersionEndpointResponse> => {
      const response = await fetch("/.well-known/version");
      if (!response.ok) throw new Error(`version endpoint returned ${response.status}`);
      return response.json();
    },
    refetchInterval: 30_000,
  });
}

export function VersionOutcomeBadge({ outcome }: { outcome?: string }) {
  const translate = useAppTranslation();
  const outcomeMeta = outcome ? OUTCOME_LABELS[outcome] : undefined;
  if (!outcomeMeta) return null;
  return (
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
  );
}

export function VersionDetails({ className }: { className?: string }) {
  const translate = useAppTranslation();
  const query = useDeployedVersion();
  const version = query.data;
  const slots = Object.entries(version?.slots ?? {});

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">{translate("common.loading")}</p>;
  }
  if (!version?.fingerprint) {
    return <p className="text-muted-foreground text-sm">{translate("version.unreachable")}</p>;
  }
  return (
    <dl className={cn("space-y-1 text-sm", className)} data-testid="version-details">
      <div className="flex flex-wrap items-center gap-2">
        <dt className="text-muted-foreground">{translate("version.fingerprint")}</dt>
        <dd className="font-mono break-all">{version.fingerprint}</dd>
        <VersionOutcomeBadge outcome={version.watch?.lastOutcome} />
      </div>
      {slots.length > 0 && (
        <div>
          <dt className="text-muted-foreground">{translate("version.slots")}</dt>
          <dd className="mt-1 space-y-0.5">
            {slots.map(([slot, pin]) => (
              <div key={slot} className="flex flex-wrap gap-x-2 font-mono text-xs">
                <span className="text-muted-foreground">{slot}</span>
                <span className="break-all">{pin}</span>
              </div>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

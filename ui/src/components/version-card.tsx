import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components";
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

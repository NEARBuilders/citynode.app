import { InfoIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
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

export function showsAppInfo(isAdmin: boolean, pathname: string) {
  return isAdmin && (pathname === "/admin" || pathname.startsWith("/admin/"));
}

export function AppInfoMenu() {
  const translate = useAppTranslation();
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={translate("admin.appInfo")}
        data-testid="admin-app-info-trigger"
      >
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" data-testid="admin-app-info">
        <PopoverTitle>{translate("version.title")}</PopoverTitle>
        <VersionDetails />
      </PopoverContent>
    </Popover>
  );
}

function VersionDetails() {
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

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">{translate("common.loading")}</p>;
  }
  if (query.isError || !version?.fingerprint) {
    return <p className="text-muted-foreground text-sm">{translate("version.unreachable")}</p>;
  }
  return (
    <dl className="space-y-1 text-sm" data-testid="admin-app-info-version">
      <div className="flex flex-wrap items-center gap-2">
        <dt className="text-muted-foreground">{translate("version.fingerprint")}</dt>
        <dd className="font-mono break-all">{version.fingerprint}</dd>
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
                <span className="break-all">{pin}</span>
              </div>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

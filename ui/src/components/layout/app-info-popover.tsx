import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { type ClientRuntimeConfig, getAccount, useApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { organizationByIdQueryOptions } from "@/lib/queries/organizations";

interface VersionEndpointResponse {
  fingerprint?: string;
  slots?: Record<string, string>;
  watch?: { lastOutcome?: string };
}

const OUTCOME_LABELS: Record<
  string,
  { label: AppMessageId; variant: "success" | "secondary" | "destructive" }
> = {
  clean: { label: "version.clean", variant: "success" },
  swapped: { label: "version.swapped", variant: "secondary" },
  "swap-failed": { label: "version.swapFailed", variant: "destructive" },
  "pointer-unreachable": { label: "version.pointerUnreachable", variant: "destructive" },
};

export function showsAppInfo(isAdmin: boolean, pathname: string) {
  return isAdmin && (pathname === "/admin" || pathname.startsWith("/admin/"));
}

export function AppInfoPopover({
  runtimeConfig,
}: {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}) {
  const translate = useAppTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={translate("appInfo.title")}
        data-testid="app-info-trigger"
      >
        <ShieldCheckIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" data-testid="app-info">
        <PopoverHeader>
          <PopoverTitle>{translate("appInfo.title")}</PopoverTitle>
        </PopoverHeader>
        {open && <AppInfoBody runtimeConfig={runtimeConfig} />}
      </PopoverContent>
    </Popover>
  );
}

function AppInfoBody({ runtimeConfig }: { runtimeConfig?: Partial<ClientRuntimeConfig> }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const platformAccount = getAccount(runtimeConfig);
  const tenantQuery = useQuery({
    queryKey: ["app-info", "tenant", platformAccount],
    queryFn: () => apiClient.resolveTenant({ accountId: platformAccount }),
    enabled: !!platformAccount,
    retry: false,
  });
  const orgId = tenantQuery.data?.orgId ?? "";
  const organizationQuery = useQuery({
    ...organizationByIdQueryOptions(apiClient, orgId),
    enabled: !!orgId,
  });
  const versionQuery = useQuery({
    queryKey: ["deployed-version"],
    queryFn: async (): Promise<VersionEndpointResponse> => {
      const response = await fetch("/.well-known/version");
      if (!response.ok) throw new Error(`version endpoint returned ${response.status}`);
      return response.json();
    },
    refetchInterval: 30_000,
  });
  const version = versionQuery.data;
  const outcome = version?.watch?.lastOutcome ? OUTCOME_LABELS[version.watch.lastOutcome] : null;
  const slots = Object.entries(version?.slots ?? {});
  const organizationSlug = organizationQuery.data?.slug;

  return (
    <dl className="flex flex-col gap-3 text-sm">
      <InfoLine id="platform-account" label={translate("admin.platformAccount")}>
        <span className="font-mono break-all">{platformAccount}</span>
      </InfoLine>
      {tenantQuery.data && (
        <InfoLine id="site" label={translate("common.site")}>
          {tenantQuery.data.name}
        </InfoLine>
      )}
      {organizationSlug && (
        <InfoLine id="organization" label={translate("common.organization")}>
          <Link to="/orgs/$slug" params={{ slug: organizationSlug }} className="hover:underline">
            {organizationSlug}
          </Link>
        </InfoLine>
      )}
      <InfoLine id="version" label={translate("version.title")}>
        {versionQuery.isLoading ? (
          <span className="text-muted-foreground">{translate("common.loading")}</span>
        ) : versionQuery.isError || !version?.fingerprint ? (
          <span className="text-muted-foreground">{translate("version.unreachable")}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{version.fingerprint}</span>
            {outcome && <Badge variant={outcome.variant}>{translate(outcome.label)}</Badge>}
          </span>
        )}
      </InfoLine>
      {slots.length > 0 && (
        <InfoLine id="slots" label={translate("version.slots")}>
          <span className="flex flex-col gap-0.5">
            {slots.map(([slot, pin]) => (
              <span key={slot} className="flex gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{slot}</span>
                <span className="break-all">{pin}</span>
              </span>
            ))}
          </span>
        </InfoLine>
      )}
    </dl>
  );
}

function InfoLine({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={`app-info-${id}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

import { InfoIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ReactNode } from "react";
import type { ClientRuntimeConfig, SessionData } from "@/app";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useDeployedVersion, VersionOutcomeBadge } from "@/components/version-card";
import { useAppTranslation } from "@/i18n/runtime";
import { useRuntimeRows } from "./-runtime-rows";

interface AppInfoPopoverProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  session?: SessionData | null;
}

export function AppInfoPopover({ runtimeConfig, session }: AppInfoPopoverProps) {
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
      <PopoverContent align="end" className="w-80 gap-3" data-testid="admin-app-info">
        <VersionSection />
        <Separator />
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{translate("admin.runtime")}</h3>
          <RuntimeList runtimeConfig={runtimeConfig} session={session} />
        </section>
      </PopoverContent>
    </Popover>
  );
}

function VersionSection() {
  const translate = useAppTranslation();
  const query = useDeployedVersion();
  const version = query.data;
  const slots = Object.entries(version?.slots ?? {});
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <PopoverTitle className="text-sm">{translate("version.title")}</PopoverTitle>
        <VersionOutcomeBadge outcome={version?.watch?.lastOutcome} />
      </div>
      {query.isLoading ? (
        <p className="text-muted-foreground text-xs">{translate("common.loading")}</p>
      ) : !version?.fingerprint ? (
        <p className="text-muted-foreground text-xs">{translate("version.unreachable")}</p>
      ) : (
        <InfoGrid testId="admin-app-info-version">
          <InfoRow id="fingerprint" label={translate("version.fingerprint")} mono>
            {version.fingerprint}
          </InfoRow>
          {slots.map(([slot, pin]) => (
            <InfoRow key={slot} id={`slot-${slot}`} label={slot} mono title={pin}>
              {pin.replace(/^versions\//, "").replace(/\.json$/, "")}
            </InfoRow>
          ))}
        </InfoGrid>
      )}
    </section>
  );
}

function RuntimeList({ runtimeConfig, session }: AppInfoPopoverProps) {
  const rows = useRuntimeRows({ runtimeConfig, user: session?.user });
  return (
    <InfoGrid testId="admin-app-info-runtime">
      {rows.map((row) => (
        <InfoRow key={row.id} id={row.id} label={row.label} mono={row.mono}>
          {row.value}
        </InfoRow>
      ))}
    </InfoGrid>
  );
}

function InfoGrid({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs" data-testid={testId}>
      {children}
    </dl>
  );
}

function InfoRow({
  id,
  label,
  mono,
  title,
  children,
}: {
  id: string;
  label: string;
  mono?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid" data-testid={`admin-app-info-${id}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-foreground", mono && "font-mono")} title={title}>
        {children}
      </dd>
    </div>
  );
}

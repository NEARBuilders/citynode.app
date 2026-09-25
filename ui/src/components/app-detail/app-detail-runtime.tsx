import { buildTenantUrl } from "@/lib/tenant-url";
import { AppDetailSectionLabel } from "./app-detail-section-label";
import { AppDetailStartCommand } from "./app-detail-start-command";
import { BASE_RUNTIME, type RegistryAppDetail } from "./app-detail-types";

export function AppDetailRuntime({
  accountId,
  gatewayId,
  app,
}: {
  accountId: string;
  gatewayId: string;
  app: RegistryAppDetail;
}) {
  const isTenant = app.extends === BASE_RUNTIME;
  const startCommand = `bunx everything-dev@latest start --account ${accountId} --domain ${gatewayId}`;
  const extendCommand = `bunx everything-dev@latest init --extends bos://${accountId}/${gatewayId}`;

  return (
    <>
      <section className="space-y-2">
        <AppDetailSectionLabel>Runtime</AppDetailSectionLabel>
        <div className="space-y-1.5">
          <RuntimeRow label="host" value={app.hostUrl} />
          <RuntimeRow label="ui" value={app.uiUrl} />
          <RuntimeRow label="api" value={app.apiUrl} />
          {app.uiSsrUrl && <RuntimeRow label="ssr" value={app.uiSsrUrl} />}
          {app.extends && <RuntimeRow label="extends" value={app.extends} isUrl={false} mono />}
          {isTenant && (
            <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 space-y-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tenant runtime — the shared host serves a custom UI at{" "}
                {app.domain ? (
                  <a
                    href={buildTenantUrl(app.domain, gatewayId) ?? `https://${app.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-foreground hover:underline"
                  >
                    {app.domain}
                  </a>
                ) : (
                  <span className="font-mono">{accountId}.everything.dev</span>
                )}{" "}
                while keeping the base auth, API, and plugins intact.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <AppDetailSectionLabel>Start command</AppDetailSectionLabel>
        <AppDetailStartCommand command={startCommand} />
      </section>

      <section className="space-y-2">
        <AppDetailSectionLabel>Extend command</AppDetailSectionLabel>
        <AppDetailStartCommand command={extendCommand} />
      </section>
    </>
  );
}

function RuntimeRow({
  label,
  value,
  isUrl = true,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  isUrl?: boolean;
  mono?: boolean;
}) {
  if (!value) return null;
  const looksLikeUrl = isUrl && /^https?:\/\//.test(value);
  return (
    <div className="flex items-start gap-2 rounded border border-border bg-muted/10 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground shrink-0 font-medium min-w-10">{label}</span>
      {looksLikeUrl ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-foreground hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <span className={`text-foreground break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}

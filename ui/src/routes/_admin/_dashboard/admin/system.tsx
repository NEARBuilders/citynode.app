import { createFileRoute } from "@tanstack/react-router";
import { getAccount, getActiveRuntime, getAppName, getRepository } from "@/app";
import { Badge, InfoRow, PageHeader, SectionHeader } from "@/components";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_admin/_dashboard/admin/system")({
  loader: async ({ context }) => ({
    runtimeConfig: context.runtimeConfig,
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.systemAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminSystem,
});

function AdminSystem() {
  const translate = useAppTranslation();
  const { runtimeConfig } = Route.useLoaderData();
  const account = getAccount(runtimeConfig);
  const appName = getAppName(runtimeConfig);
  const repository = getRepository(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);

  const env = runtimeConfig?.env;
  const networkId = runtimeConfig?.networkId;
  const hostUrl = runtimeConfig?.hostUrl;
  const apiBase = runtimeConfig?.apiBase;
  const rpcBase = runtimeConfig?.rpcBase;
  const assetsUrl = runtimeConfig?.assetsUrl;
  const runtimeBasePath = runtime?.runtimeBasePath;

  return (
    <>
      <PageHeader
        title={translate("nav.system")}
        description={translate("admin.system.runtimeDescription")}
        actions={
          <div className="flex flex-wrap gap-2">
            {env && (
              <Badge
                variant={env === "production" ? "success" : "warning"}
                data-testid="admin-system-env"
              >
                {env}
              </Badge>
            )}
            {networkId && (
              <Badge variant="outline" data-testid="admin-system-network">
                {networkId}
              </Badge>
            )}
          </div>
        }
        headerTestId="admin-system.heading"
      />

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("about.runtime")} sectionTestId="admin.heading.runtime" />
        <div className="flex flex-col">
          <InfoRow label={translate("common.account")} value={runtime?.accountId ?? account} mono />
          <InfoRow label={translate("common.name")} value={appName} />
          <InfoRow label={translate("about.gateway")} value={runtime?.gatewayId} mono />
          <InfoRow label={translate("admin.system.basePath")} value={runtimeBasePath ?? "/"} mono />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("admin.system.deployment")}
          sectionTestId="admin.heading.deployment"
        />
        <div className="flex flex-col">
          <InfoRow label={translate("admin.system.environment")} value={env ?? "—"} mono />
          <InfoRow label={translate("common.network")} value={networkId ?? "—"} mono />
          <InfoRow label={translate("admin.system.host")} value={hostUrl ?? "—"} mono />
          <InfoRow label={translate("about.repository")} value={repository} mono />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("admin.system.endpoints")}
          sectionTestId="admin.heading.endpoints"
        />
        <div className="flex flex-col">
          <InfoRow label="API" value={apiBase} mono />
          <InfoRow label="RPC" value={rpcBase} mono />
          <InfoRow label={translate("admin.system.assets")} value={assetsUrl} mono />
        </div>
      </section>
    </>
  );
}

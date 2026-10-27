import { GasPumpIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { getAccount } from "@/app";
import { Button, PageContainer } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { organizationByIdQueryOptions } from "@/lib/queries/organizations";
import { tenantByAccountQueryOptions } from "@/lib/queries/tenants";
import { useRelayerInfoQuery } from "@/lib/use-relayer";

export const Route = createFileRoute("/_admin/_dashboard/admin")({
  beforeLoad: async ({ context }) => {
    const { apiClient, queryClient, runtimeConfig } = context;
    const tenant = await queryClient.ensureQueryData(
      tenantByAccountQueryOptions(apiClient, getAccount(runtimeConfig)),
    );
    if (tenant?.orgId) {
      await queryClient
        .ensureQueryData(organizationByIdQueryOptions(apiClient, tenant.orgId))
        .catch(() => null);
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.admin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <PageContainer variant="wide">
      <RelayerFundingNotice />
      <Outlet />
    </PageContainer>
  );
}

function RelayerFundingNotice() {
  const translate = useAppTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: relayerInfo } = useRelayerInfoQuery();
  const needsFunding = !!relayerInfo && relayerInfo.enabled === false && !!relayerInfo.accountId;
  if (!needsFunding || pathname.startsWith("/admin/relayer")) return null;

  return (
    <Item variant="outline" data-testid="admin-relayer-notice">
      <ItemMedia variant="icon">
        <GasPumpIcon className="text-destructive" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("admin.relayer.needsFunding")}</ItemTitle>
        <ItemDescription>{translate("admin.relayer.paused")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/admin/relayer" />}
        >
          {translate("admin.relayer.fund")}
        </Button>
      </ItemActions>
    </Item>
  );
}

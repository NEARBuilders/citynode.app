import {
  BuildingsIcon,
  CaretRightIcon,
  CheckCircleIcon,
  GasPumpIcon,
  GavelIcon,
  GearIcon,
  TreeStructureIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { Trans } from "everything-dev/ui/i18n";
import type { ComponentType, ReactNode } from "react";
import { getAccount, useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, PageHeader, SectionHeader } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { VersionCard } from "@/components/version-card";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { presentationLabel } from "@/lib/presentation-label";
import { allNodesQueryOptions } from "@/lib/queries/nodes";
import { tenantsQueryOptions } from "@/lib/queries/tenants";
import { isSyntheticEmail } from "@/lib/synthetic-email";
import { useNearAccount } from "@/lib/use-near-account";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { formatNearFigure, ListSkeleton, StatFigure, StatGrid } from "./-admin-ui";
import {
  adminProposalListQueryOptions,
  proposalTitle,
  proposalTypeLabel,
} from "./proposals/-proposal-review";

const QUEUE_SIZE = 5;

export const Route = createFileRoute("/_admin/_dashboard/admin/")({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      adminProposalListQueryOptions(context.apiClient, "pending"),
    ),
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
  component: AdminOverview,
});

function AdminOverview() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const { auth, tenant, tenantOrganizationSlug, runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const platformAccount = getAccount(runtimeConfig);
  const user = auth?.user ?? null;
  const walletAccount = useNearAccount();

  const pendingQuery = useInfiniteQuery(adminProposalListQueryOptions(apiClient, "pending"));
  const nodesQuery = useQuery(allNodesQueryOptions(apiClient));
  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const relayerQuery = useRelayerInfoQuery();

  const pending = pendingQuery.data?.pages[0]?.data ?? [];
  const pendingTotal = pendingQuery.data?.pages[0]?.meta.total;
  const relayer = relayerQuery.data;

  return (
    <>
      <PageHeader
        title={translate("common.admin")}
        subtitle={platformAccount}
        headerTestId="admin.heading"
      />

      <StatGrid>
        <StatFigure
          label={translate("admin.waitingReview")}
          value={pendingTotal ?? "—"}
          tone={pendingTotal ? "attention" : "default"}
          testId="admin.stat.pending-proposals"
        />
        <StatFigure
          label={translate("common.communities")}
          value={nodesQuery.data?.length ?? "—"}
          testId="admin.stat.nodes"
        />
        <StatFigure
          label={translate("nav.sites")}
          value={tenantsQuery.data?.length ?? "—"}
          testId="admin.stat.tenants"
        />
        <StatFigure
          label={translate("admin.relayer.balance")}
          value={relayer?.enabled ? formatNearFigure(relayer.balance, locale) : relayer ? "0" : "—"}
          hint={
            relayer
              ? relayer.enabled
                ? "NEAR"
                : translate("admin.relayer.needsFunding")
              : translate("admin.relayer.notConfigured")
          }
          tone={relayer && !relayer.enabled ? "attention" : "default"}
          testId="admin.stat.relayer"
        />
      </StatGrid>

      <VersionCard />

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("admin.waitingReview")}
          sectionTestId="admin.section.queue"
          action={
            pendingTotal ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to="/admin/proposals" search={{ status: "pending" }} />}
              >
                {translate("common.seeAllCount", { count: pendingTotal })}
              </Button>
            ) : undefined
          }
        />
        {pendingQuery.isLoading ? (
          <ListSkeleton rows={3} />
        ) : pendingQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {translate("admin.proposalsFailed")}
          </p>
        ) : pending.length === 0 ? (
          <EmptyState
            icon={CheckCircleIcon}
            title={translate("admin.caughtUp")}
            description={translate("admin.queueEmpty")}
            className="py-10"
          />
        ) : (
          <ItemGroup data-testid="admin-queue">
            {pending.slice(0, QUEUE_SIZE).map((proposal) => (
              <Item
                key={proposal.id}
                variant="outline"
                render={
                  <Link
                    to="/admin/proposals/$proposalId"
                    params={{ proposalId: proposal.id }}
                    search={{ pluginId: proposal.pluginId, entityId: proposal.entityId }}
                  />
                }
                data-testid={`admin-queue-item-${proposal.id}`}
              >
                <ItemMedia variant="icon">
                  <GavelIcon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="min-w-0 truncate">{proposalTitle(proposal, translate)}</span>
                  </ItemTitle>
                  <ItemDescription>
                    <Trans
                      id="admin.submittedTypeDate"
                      values={{ type: proposalTypeLabel(proposal.pluginId, translate) }}
                      components={{
                        date: <LocalDate value={proposal.createdAt} format="relative" />,
                      }}
                    />
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="hidden text-sm font-medium sm:inline">
                    {translate("common.review")}
                  </span>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("nav.manage")} sectionTestId="admin.section.manage" />
        <ItemGroup>
          <ManageRow
            to="/admin/nodes"
            icon={TreeStructureIcon}
            title={translate("common.communities")}
            testId="admin.heading.nodes"
            description={translate("admin.communitiesDescription")}
          />
          <ManageRow
            to="/admin/proposals"
            icon={GavelIcon}
            title={translate("common.proposals")}
            testId="admin.heading.proposals"
            description={translate("admin.proposalsDescription")}
            badge={
              pendingTotal ? (
                <Badge variant="warning">
                  {pendingTotal}
                  {translate("common.pendingLower")}
                </Badge>
              ) : null
            }
          />
          <ManageRow
            to="/admin/tenants"
            icon={BuildingsIcon}
            title={translate("nav.sites")}
            testId="admin.heading.tenants"
            description={translate("admin.sitesDescription")}
          />
          <ManageRow
            to="/admin/organizations"
            icon={UsersIcon}
            title={translate("common.organizations")}
            testId="admin.heading.organizations"
            description={translate("orgApproval.reviewDescription")}
          />
          <ManageRow
            to="/admin/relayer"
            icon={GasPumpIcon}
            title={translate("nav.relayer")}
            testId="admin.heading.relayer"
            description={translate("admin.relayerDescription")}
          />
          <ManageRow
            to="/admin/system"
            icon={GearIcon}
            title={translate("nav.system")}
            testId="admin.heading.system"
            description={translate("admin.systemDescription")}
          />
        </ItemGroup>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("admin.runtime")} />
        <div className="flex flex-col">
          <ContextRow
            id="platform-account"
            label={translate("admin.platformAccount")}
            value={platformAccount}
            mono
          />
          {tenant && <ContextRow id="site" label={translate("common.site")} value={tenant.name} />}
          {tenant && (
            <ContextRow
              id="organization"
              label={translate("common.organization")}
              value={
                tenantOrganizationSlug ? (
                  <Link
                    to="/orgs/$slug"
                    params={{ slug: tenantOrganizationSlug }}
                    className="hover:underline"
                  >
                    {tenantOrganizationSlug}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
          )}
          {tenant?.createdAt && (
            <ContextRow
              id="created"
              label={translate("common.created")}
              value={<LocalDate value={tenant.createdAt} />}
            />
          )}
          <ContextRow
            id="name"
            label={translate("common.name")}
            value={user?.name || (isSyntheticEmail(user?.email) ? null : user?.email) || "—"}
          />
          <ContextRow
            id="role"
            label={translate("org.role")}
            value={user?.role ? presentationLabel(user.role, translate) : "—"}
          />
          <ContextRow
            id="wallet"
            label={translate("common.wallet")}
            value={walletAccount ?? translate("wallet.notConnected")}
            mono={!!walletAccount}
          />
        </div>
      </section>
    </>
  );
}

function ManageRow({
  to,
  icon: Icon,
  title,
  description,
  testId,
  badge,
}: {
  to: LinkProps["to"];
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  testId: string;
  badge?: ReactNode;
}) {
  return (
    <Item variant="outline" size="sm" render={<Link to={to} />}>
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <h3 className="min-w-0 truncate" data-testid={testId}>
            {title}
          </h3>
          {badge}
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function ContextRow({
  id,
  label,
  value,
  mono,
}: {
  id: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      data-testid={`admin.stat.${id}`}
    >
      <span className="text-sm text-muted-foreground" data-testid={`admin.stat.${id}.label`}>
        {label}
      </span>
      <span
        className={cn("text-sm break-all text-foreground sm:text-right", mono && "font-mono")}
        data-testid={`admin.stat.${id}.value`}
      >
        {value}
      </span>
    </div>
  );
}

import { CalendarDotsIcon, PencilIcon, TreeStructureIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import type { AppMessageId } from "@/i18n/catalogs";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { nodeKindLabel } from "@/lib/node-kind";
import { savedEndowmentOf } from "@/lib/node-staking-proposals";
import { pageTitle } from "@/lib/page-title";
import { adminNodeDetailQueryOptions } from "@/lib/queries/nodes";
import { BackLink } from "../-admin-ui";
import { CommunityEditorSheet } from "./-community-editor";
import { CommunityOverview, CommunityStats } from "./-community-overview";
import { CommunityProfileSummary } from "./-community-profile-summary";
import { NodeBindings } from "./-node-bindings";
import {
  NODE_DETAIL_TABS,
  type NodeDetailTab,
  parseNodeDetailTab,
  parseNodeEditSearch,
} from "./-node-management";
import { NodeStakingSequence } from "./-node-staking-sequence";
import { NodeValidators } from "./-node-validators";

const TAB_LABELS: Record<NodeDetailTab, AppMessageId> = {
  overview: "common.overview",
  validators: "common.validators",
  management: "admin.sequence.tab",
  domains: "admin.domain.title",
};

export const Route = createFileRoute("/_admin/_dashboard/admin/nodes/$nodeId")({
  validateSearch: (search: Record<string, unknown>): { tab?: NodeDetailTab; edit?: true } => ({
    tab: parseNodeDetailTab(search.tab),
    edit: parseNodeEditSearch(search),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.communityAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminNodeDetail,
});

function AdminNodeDetail() {
  const translate = useAppTranslation();
  const { nodeId } = Route.useParams();
  const { tab, edit } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const nodeQuery = useQuery(adminNodeDetailQueryOptions(apiClient, nodeId));
  const activeTab = tab ?? "overview";

  if (nodeQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (nodeQuery.isError || !nodeQuery.data) {
    return (
      <EmptyState
        icon={TreeStructureIcon}
        title={translate("admin.community.loadError")}
        description={translate("admin.community.loadErrorHint")}
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/admin/nodes" />}>
            {translate("admin.community.backNodes")}
          </Button>
        }
      />
    );
  }

  const { summary, sourceNode, parent } = nodeQuery.data;
  const { node } = summary;

  return (
    <>
      <PageHeader
        label={<BackLink to="/admin/nodes">{translate("common.communities")}</BackLink>}
        title={node.name}
        subtitle={node.slug}
        description={
          parent ? (
            <Trans
              id="admin.nodeParentNamed"
              values={{ kind: nodeKindLabel(node.kind, undefined, translate), name: parent.name }}
              components={{
                parent: (
                  <Link
                    to="/admin/nodes/$nodeId"
                    params={{ nodeId: parent.id }}
                    search={{}}
                    className="text-foreground hover:underline"
                  ></Link>
                ),
              }}
            />
          ) : (
            nodeKindLabel(node.kind, translate("label.node"), translate)
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              data-testid="admin-node-events"
              render={
                <Link
                  to="/nodes/$nodeId/content"
                  params={{ nodeId: node.id }}
                  search={{ tab: "events" }}
                />
              }
            >
              <CalendarDotsIcon />
              {translate("events.title")}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              data-testid="admin-node-edit"
              render={
                <Link
                  to="/admin/nodes/$nodeId"
                  params={{ nodeId: node.id }}
                  search={{ tab, edit: true }}
                />
              }
            >
              <PencilIcon />
              {translate("admin.community.edit")}
            </Button>
          </>
        }
        headerTestId="admin-node.heading"
      />

      <CommunityProfileSummary nodeId={node.id} name={node.name} hasSite={!!node.tenantId} />
      <CommunityEditorSheet
        node={node}
        open={edit === true}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: (prev) => ({ ...prev, edit: undefined }) });
        }}
      />

      <CommunityStats summary={summary} sourceName={sourceNode?.name} />

      <div className="flex flex-col gap-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = parseNodeDetailTab(value);
              void navigate({ search: { tab: next === "overview" ? undefined : next } });
            }}
          >
            <TabsList variant="line">
              {NODE_DETAIL_TABS.map((value) => (
                <TabsTrigger key={value} value={value} data-testid={`admin-node-tab-${value}`}>
                  {translate(TAB_LABELS[value])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {activeTab === "overview" && (
          <CommunityOverview summary={summary} sourceName={sourceNode?.name} />
        )}
        {activeTab === "validators" && (
          <NodeValidators key={node.id} nodeId={node.id} validators={summary.validators} />
        )}
        {activeTab === "management" && (
          <NodeStakingSequence
            key={`${node.id}:${savedEndowmentOf(node.metadata)}`}
            nodeId={node.id}
            tenantId={node.tenantId}
            savedEndowment={savedEndowmentOf(node.metadata)}
            validators={summary.validators}
          />
        )}
        {activeTab === "domains" &&
          (node.tenantId ? (
            <NodeBindings
              key={node.tenantId}
              tenantId={node.tenantId}
              gateway={getActiveRuntime(runtimeConfig)?.gatewayId ?? ""}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{translate("admin.community.noTenant")}</p>
          ))}
      </div>
    </>
  );
}

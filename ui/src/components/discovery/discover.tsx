import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { translateEnglishAppMessage, useAppTranslation } from "@/i18n/runtime";
import { CurateReports } from "./curate-reports";
import { CurateTeam } from "./curate-team";
import { DiscoveryAction } from "./discovery-action";
import { DiscoveryMetrics } from "./discovery-measurement";

type Studio = Awaited<ReturnType<ApiClient["getDiscoveryStudio"]>>;
type StudioNode = Studio["nodes"][number];

export function createCommunityFilters(t: AppTranslator) {
  return [
    { label: t("directory.all"), value: "all" },
    { label: t("directory.attention"), value: "attention" },
    { label: t("directory.featured"), value: "featured" },
  ];
}

export function needsAttention(node: Pick<StudioNode, "summary" | "channels" | "active">) {
  return !node.summary || !node.channels.length || !node.active;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function Discover() {
  const translate = useAppTranslation();
  const COMMUNITY_FILTERS = createCommunityFilters(translate);

  const api = useApiClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const studio = useQuery({
    queryKey: ["discover"],
    queryFn: () => api.getDiscoveryStudio(),
    retry: false,
  });
  if (studio.isPending)
    return (
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-5 w-full max-w-sm" />
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-16 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-md" />
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  if (studio.isError)
    return (
      <EmptyState
        icon={ShieldCheckIcon}
        title={translate("directory.curatorsOnly")}
        description={translate("directory.curatorsOnlyHint")}
        action={
          <>
            <Button nativeButton={false} render={<Link to="/dashboard/node" />}>
              {translate("directory.myCommunity")}
            </Button>
            <Button variant="ghost" onClick={() => studio.refetch()}>
              {translate("common.retry")}
            </Button>
          </>
        }
      />
    );
  const data = studio.data;
  const selected = data.nodes.find((node) => node.nodeId === selectedId);
  const rows = data.nodes.filter(
    (node) =>
      `${node.name} ${node.location} ${node.region}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter !== "attention" || needsAttention(node)) &&
      (filter !== "featured" || node.featured),
  );
  const attentionCount = data.nodes.filter(needsAttention).length;
  const featuredCount = data.nodes.filter((node) => node.featured).length;
  const reportsOpen = data.reports.filter((report) => !report.resolved).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        headerTestId="curate.heading"
        title={translate("nav.directory")}
        description={translate("directory.description")}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link to="/explore" />}>
            {translate("directory.openExplore")}
            <ArrowUpRightIcon />
          </Button>
        }
      />
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label={translate("common.communities")} value={data.nodes.length} />
        <Stat label={translate("directory.attentionShort")} value={attentionCount} />
        <Stat label={translate("directory.featured")} value={featuredCount} />
        {data.isAdmin && <Stat label={translate("reports.open")} value={reportsOpen} />}
      </dl>
      <Tabs defaultValue="communities">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line">
            <TabsTrigger value="communities" data-testid="studio-tab-communities">
              {translate("common.communities")}
            </TabsTrigger>
            {data.isAdmin && (
              <TabsTrigger value="reports" data-testid="studio-tab-reports">
                {translate("directory.reports")}
                {reportsOpen > 0 && <Badge variant="warning">{reportsOpen}</Badge>}
              </TabsTrigger>
            )}
            <TabsTrigger value="engagement" data-testid="studio-tab-engagement">
              {translate("directory.engagement")}
            </TabsTrigger>
            {data.isAdmin && (
              <TabsTrigger value="access" data-testid="studio-tab-access">
                {translate("org.team")}
              </TabsTrigger>
            )}
          </TabsList>
        </div>
        <TabsContent value="communities" className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={translate("directory.search")}
                placeholder={translate("directory.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
            <Select
              items={COMMUNITY_FILTERS}
              value={filter}
              onValueChange={(value) => setFilter(value ?? "all")}
            >
              <SelectTrigger
                aria-label={translate("directory.filter")}
                className="w-full sm:w-auto"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMUNITY_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title={translate("directory.noMatches")}
              description={translate("directory.noMatchesHint")}
            />
          ) : (
            <ItemGroup data-testid="curate-communities">
              {rows.map((node) => (
                <Item key={node.nodeId} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      <span className="min-w-0 truncate">{node.name}</span>
                      {node.featured && (
                        <Badge variant="success">
                          <SparkleIcon />
                          {translate("directory.featured")}
                        </Badge>
                      )}
                      {needsAttention(node) && (
                        <Badge variant="warning">{translate("directory.attention")}</Badge>
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {[node.location, node.region].filter(Boolean).join(" · ") ||
                        translate("directory.noLocation")}
                      {" · "}
                      {node.active ? translate("common.active") : translate("directory.quiet")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`studio-manage-${node.nodeId}`}
                      onClick={() => setSelectedId(node.nodeId)}
                    >
                      {translate("nav.manage")}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </TabsContent>
        <TabsContent value="engagement" className="pt-6">
          <DiscoveryMetrics nodes={data.nodes} />
        </TabsContent>
        {data.isAdmin && (
          <TabsContent value="reports" className="pt-6">
            <CurateReports studio={data} />
          </TabsContent>
        )}
        {data.isAdmin && (
          <TabsContent value="access" className="pt-6">
            <CurateTeam curators={data.curators} />
          </TabsContent>
        )}
      </Tabs>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        >
          {selected && <CommunitySheetBody node={selected} isAdmin={data.isAdmin} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CommunitySheetBody({ node, isAdmin }: { node: StudioNode; isAdmin: boolean }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [confirmUnfeature, setConfirmUnfeature] = useState(false);
  const unfeature = useMutation({
    mutationFn: () =>
      api.featureDiscoveryNode({
        nodeId: node.nodeId,
        label: translate("common.expired"),
        expiresAt: new Date(0).toISOString(),
      }),
    onSuccess: async () => {
      toast.success(translate("community.unfeaturedNamed", { name: node.name ?? "" }));
      setConfirmUnfeature(false);
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("discover"),
      });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const checks = [
    {
      ready: !!node.summary,
      label: node.summary
        ? translate("community.hasDescription")
        : translate("community.noDescription"),
    },
    {
      ready: node.latitude !== null,
      label: node.latitude !== null ? translate("community.onMap") : translate("community.offMap"),
    },
    {
      ready: !!node.channels.length,
      label: node.channels.length
        ? translate("community.hasJoinLink")
        : translate("community.noJoinLink"),
    },
    { ready: node.active, label: node.activityReason },
  ];
  return (
    <>
      <SheetHeader className="px-6 pt-8 pr-16">
        <SheetTitle>{node.name}</SheetTitle>
        <SheetDescription>
          {[node.location, node.region].filter(Boolean).join(" · ") ||
            translate("directory.noLocation")}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-10 px-6 pb-8">
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-medium">{translate("directory.visitorView")}</h3>
          <ul className="flex flex-col gap-2">
            {checks.map(({ ready, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                {ready ? (
                  <CheckCircleIcon className="size-4 shrink-0 text-success" />
                ) : (
                  <WarningCircleIcon className="size-4 shrink-0 text-warning" />
                )}
                {label}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              nativeButton={false}
              render={
                <Link
                  to="/nodes/$nodeId/content"
                  params={{ nodeId: node.nodeId }}
                  search={{ tab: "profile" }}
                />
              }
            >
              {translate("directory.editContent")}
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-medium">{translate("directory.feature")}</h3>
            {node.featured && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmUnfeature(true)}>
                {translate("directory.stopFeature")}
              </Button>
            )}
          </div>
          {node.featured && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">
                <SparkleIcon />
                {translate("directory.featured")}
              </Badge>
              {node.featured}
            </p>
          )}
          <DiscoveryAction
            testId={`discovery-feature-${node.nodeId}`}
            label={
              node.featured
                ? translate("directory.updateFeature")
                : translate("directory.featureCommunity")
            }
            successMessage={translate("community.featuredNamed", { name: node.name ?? "" })}
            run={(data) =>
              api.featureDiscoveryNode({
                nodeId: node.nodeId,
                label: String(data.get("label")),
                expiresAt: new Date(String(data.get("expires"))).toISOString(),
              })
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`feature-label-${node.nodeId}`}>
                  {translate("directory.label")}
                </FieldLabel>
                <Input
                  id={`feature-label-${node.nodeId}`}
                  name="label"
                  required
                  maxLength={80}
                  placeholder={translate("directory.labelExample")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`feature-expires-${node.nodeId}`}>
                  {translate("directory.until")}
                </FieldLabel>
                <Input
                  id={`feature-expires-${node.nodeId}`}
                  name="expires"
                  type="datetime-local"
                  required
                />
              </Field>
            </div>
          </DiscoveryAction>
        </section>

        <DiscoveryHistory nodeId={node.nodeId} />
      </div>
      <ConfirmDialog
        open={confirmUnfeature}
        onOpenChange={setConfirmUnfeature}
        title={translate("community.unfeatureQuestion", { name: node.name ?? "" })}
        description={translate("directory.featureRemovalHint")}
        confirmLabel={translate("community.stopFeaturing")}
        cancelLabel={translate("common.cancel")}
        variant="destructive"
        isPending={unfeature.isPending}
        onConfirm={() => unfeature.mutate()}
      />
    </>
  );
}

export function DiscoveryHistory({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const history = useQuery({
    queryKey: ["discovery-history", nodeId],
    queryFn: () => api.getDiscoveryHistory({ nodeId }),
    retry: false,
  });
  if (!history.data?.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={translate("directory.recentChanges")} />
      <ul className="flex flex-col divide-y divide-border text-sm">
        {history.data.slice(0, 8).map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">{historyLabel(entry.action, translate)}</span>
            <span className="shrink-0 text-muted-foreground">
              <LocalDate value={entry.recordedAt} format="relative" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function historyLabel(action: string, t: AppTranslator = translateEnglishAppMessage) {
  if (action.startsWith("Luma connected")) return t("community.historyLumaConnected");
  if (action === "Luma calendar disconnected") return t("community.historyLumaDisconnected");
  if (action === "moderation: unpublish") return t("community.historyUnpublished");
  if (action === "profile published") return t("community.historyPublished");
  if (action === "profile saved as draft") return t("community.historyDraft");
  if (action.endsWith(" published")) return t("events.published");
  if (action.endsWith(" draft")) return t("community.historySavedDraft");
  if (action.endsWith(" cancelled")) return t("events.historyCancelled");
  return t("things.actionUpdated");
}

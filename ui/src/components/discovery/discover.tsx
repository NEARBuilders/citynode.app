import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, Input, Textarea } from "@/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscoveryAction } from "./discovery-action";
import { DiscoveryMetrics } from "./discovery-measurement";

export function Discover() {
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
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  if (studio.isError)
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-border p-8 text-center"
      >
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          This page is for people who help look after Explore
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This space is for people who help look after the whole network. To add events or edit your
          own community, go to My community.
        </p>
        <Link to="/dashboard/node" className="font-medium underline">
          Manage my community
        </Link>
        <Button variant="outline" onClick={() => studio.refetch()}>
          Try again
        </Button>
      </div>
    );
  const selected = studio.data.nodes.find((node) => node.nodeId === selectedId);
  const needsAttention = (node: (typeof studio.data.nodes)[number]) =>
    !node.summary || !node.channels.length || !node.active;
  const rows = studio.data.nodes.filter(
    (node) =>
      `${node.name} ${node.location} ${node.region}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter !== "attention" || needsAttention(node)) &&
      (filter !== "featured" || node.featured),
  );
  const reportsOpen = studio.data.reports.filter((report) => !report.resolved).length;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Highlights</h1>
          <p className="text-sm text-muted-foreground">
            Help people find a community, review a report, or see what’s drawing interest.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/explore">
            View public map <ArrowUpRight />
          </Link>
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Want to add an event or share a post?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Those belong to a community. Start in My community, or open a community below to manage
            its page.
          </p>
        </div>
        <Link
          to="/dashboard/node"
          className="shrink-0 text-sm font-semibold underline underline-offset-4"
        >
          Go to My community →
        </Link>
      </div>
      <Tabs defaultValue="communities" className="gap-6">
        <TabsList className="justify-start">
          <TabsTrigger value="communities" data-testid="studio-tab-communities">
            Communities
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
              {studio.data.nodes.length}
            </span>
          </TabsTrigger>
          {studio.data.isAdmin && (
            <TabsTrigger value="reports" data-testid="studio-tab-reports">
              Reports
              {reportsOpen > 0 && (
                <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                  {reportsOpen}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="engagement" data-testid="studio-tab-engagement">
            Engagement
          </TabsTrigger>
          {studio.data.isAdmin && (
            <TabsTrigger value="access" data-testid="studio-tab-access">
              Team
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="communities" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search communities"
                className="pl-10"
                placeholder="Search communities…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Show
              <select
                aria-label="Community filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-10 rounded-[12px] border-2 border-inset border-border-strong bg-card px-3 text-foreground"
              >
                <option value="all">All communities</option>
                <option value="attention">Needs attention</option>
                <option value="featured">Featured</option>
              </select>
            </label>
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-border-strong bg-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_140px_140px_88px] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
              <span>Community</span>
              <span>Activity</span>
              <span>Placement</span>
              <span className="text-right">Manage</span>
            </div>
            {rows.map((node) => (
              <div
                key={node.nodeId}
                className="grid items-center gap-3 border-b border-border px-4 py-3.5 last:border-0 sm:px-5 md:grid-cols-[minmax(0,1fr)_140px_140px_88px] md:gap-4"
              >
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{node.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {node.location || "Location not provided"}
                    {node.region ? ` · ${node.region}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`size-1.5 rounded-full ${node.active ? "bg-primary" : "bg-muted-foreground"}`}
                  />
                  {node.active ? "Active" : "Quiet lately"}
                  {needsAttention(node) && (
                    <CircleAlert
                      aria-label="Needs attention"
                      className="size-3.5 text-muted-foreground"
                    />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {node.featured ? (
                    <Badge variant="secondary">
                      <Sparkles />
                      Featured
                    </Badge>
                  ) : (
                    "Not featured"
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start md:justify-end"
                  data-testid={`studio-manage-${node.nodeId}`}
                  onClick={() => setSelectedId(node.nodeId)}
                >
                  Manage <ChevronRight />
                </Button>
              </div>
            ))}
            {!rows.length && (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <p className="font-medium">No communities to show</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search, or publish a community so it appears here.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} communities · {studio.data.nodes.filter(needsAttention).length} need
            attention. Open a community to review its content and placement.
          </p>
        </TabsContent>
        <TabsContent value="engagement">
          <DiscoveryMetrics nodes={studio.data.nodes} />
        </TabsContent>
        {studio.data.isAdmin && (
          <TabsContent value="reports" className="flex flex-col gap-5">
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">Reports</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Visitors send reports when a link, event, or community page seems wrong. Check
                  what happened, then keep the content or hide it from Explore.
                </p>
              </div>
              {studio.data.reports.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col gap-4 rounded-2xl border-2 border-border-strong bg-card p-5"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {report.kind === "profile" ? "Community page" : "Event or post"} ·{" "}
                    {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                  <p className="font-medium">
                    {report.kind === "profile"
                      ? (studio.data.nodes.find((node) => node.nodeId === report.targetId)?.name ??
                        "A community")
                      : "An event or post"}
                  </p>
                  {report.kind === "profile" ? (
                    <Link
                      to="/explore"
                      search={{ node: report.targetId }}
                      target="_blank"
                      className="text-sm underline"
                    >
                      Open reported community
                    </Link>
                  ) : (
                    <Link
                      to="/activity/$activityId"
                      params={{ activityId: report.targetId }}
                      target="_blank"
                      className="text-sm underline"
                    >
                      Open reported event or update
                    </Link>
                  )}
                  <p className="text-sm">{report.reason}</p>
                  {report.resolved ? (
                    <p className="text-sm text-muted-foreground">Resolved: {report.note}</p>
                  ) : (
                    <DiscoveryAction
                      testId={`discovery-resolve-report-${report.id}`}
                      label="Resolve report"
                      run={(data) =>
                        api.moderateDiscoveryReport({
                          reportId: report.id,
                          action: data.get("action") === "unpublish" ? "unpublish" : "dismiss",
                          note: String(data.get("note")),
                        })
                      }
                    >
                      <label htmlFor={`note-${report.id}`}>
                        Note (only your team sees this)
                        <Textarea id={`note-${report.id}`} name="note" required maxLength={1000} />
                      </label>
                      <label htmlFor={`action-${report.id}`}>
                        Action
                        <select
                          aria-label="What should we do"
                          id={`action-${report.id}`}
                          name="action"
                          className="mt-1.5 h-10 rounded-[12px] border-2 border-inset border-border-strong bg-card px-3"
                        >
                          <option value="dismiss">Keep content · close report</option>
                          <option value="unpublish">Hide content from Explore</option>
                        </select>
                      </label>
                    </DiscoveryAction>
                  )}
                </article>
              ))}
              {!studio.data.reports.length && (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/40 p-12 text-center">
                  <ShieldCheck className="size-8 text-muted-foreground" />
                  <p className="font-medium">You’re all caught up</p>
                  <p className="text-sm text-muted-foreground">
                    New visitor reports will appear here.
                  </p>
                </div>
              )}
            </section>
          </TabsContent>
        )}
        {studio.data.isAdmin && (
          <TabsContent
            value="access"
            className="max-w-2xl rounded-2xl border-2 border-border-strong bg-card p-6"
          >
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">Who can highlight communities</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Invite someone to help people find good communities. They can highlight a
                  community, spot pages that need an update, and see which links people open.
                </p>
              </div>
              <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
                This doesn’t let them change a community’s page, add events, or deal with reports.
                Community owners manage their own content; site admins handle reports and access.
              </p>
              <DiscoveryAction
                label="Give access"
                run={(data) =>
                  api.setDiscoveryCurator({ userId: String(data.get("userId")), enabled: true })
                }
              >
                <label htmlFor="curator-user">
                  Their CityNode account
                  <Input id="curator-user" name="userId" required placeholder="Account" />
                </label>
              </DiscoveryAction>
              {studio.data.curators.map((userId) => (
                <DiscoveryAction
                  key={userId}
                  label={`Remove access: ${userId}`}
                  run={() => api.setDiscoveryCurator({ userId, enabled: false })}
                />
              ))}
            </section>
          </TabsContent>
        )}
      </Tabs>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="px-6 pb-4 pt-8 pr-16">
            <SheetTitle className="text-xl">{selected?.name ?? "Manage community"}</SheetTitle>
            <SheetDescription>
              Check what visitors see and choose whether to highlight this community.
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="flex flex-col gap-7 px-6 pb-8">
              {studio.data.isAdmin && (
                <Button asChild>
                  <Link to="/nodes/$nodeId/content" params={{ nodeId: selected.nodeId }}>
                    Manage events, posts & profile <ArrowUpRight />
                  </Link>
                </Button>
              )}
              <div className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What visitors can see
                </h2>
                {[
                  {
                    ready: !!selected.summary,
                    label: selected.summary
                      ? "Community description"
                      : "Add a community description",
                  },
                  {
                    ready: selected.latitude !== null,
                    label: selected.latitude !== null ? "Shown on the map" : "Not on the map yet",
                  },
                  {
                    ready: !!selected.channels.length,
                    label: selected.channels.length
                      ? "Community links added"
                      : "Add a link where people can join",
                  },
                  { ready: selected.active, label: selected.activityReason },
                ].map(({ ready, label }) => (
                  <p key={label} className="flex items-center gap-2.5 text-sm">
                    {ready ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <CircleAlert className="size-4 text-muted-foreground" />
                    )}
                    {label}
                  </p>
                ))}
              </div>
              <div className="flex flex-col gap-4 rounded-xl bg-muted/40 p-4">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Sparkles className="size-4" />
                    Highlight this community
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A featured label helps it stand out on Explore. Pick a short reason and when the
                    highlight should end.
                  </p>
                </div>
                {selected.featured && (
                  <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
                    Featured: {selected.featured}
                  </p>
                )}
                <DiscoveryAction
                  testId={`discovery-feature-${selected.nodeId}`}
                  label={`Feature ${selected.name}`}
                  run={(data) =>
                    api.featureDiscoveryNode({
                      nodeId: selected.nodeId,
                      label: String(data.get("label")),
                      expiresAt: new Date(String(data.get("expires"))).toISOString(),
                    })
                  }
                >
                  <label htmlFor={`feature-label-${selected.nodeId}`}>
                    Why it’s featured
                    <Input
                      id={`feature-label-${selected.nodeId}`}
                      name="label"
                      required
                      maxLength={80}
                    />
                  </label>
                  <label htmlFor={`feature-expires-${selected.nodeId}`}>
                    Show until
                    <Input
                      id={`feature-expires-${selected.nodeId}`}
                      name="expires"
                      type="datetime-local"
                      required
                    />
                  </label>
                </DiscoveryAction>
                <DiscoveryAction
                  label={`Remove feature for ${selected.name}`}
                  run={() =>
                    api.featureDiscoveryNode({
                      nodeId: selected.nodeId,
                      label: "Expired",
                      expiresAt: new Date(0).toISOString(),
                    })
                  }
                />
              </div>
              <DiscoveryHistory nodeId={selected.nodeId} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
export function DiscoveryHistory({ nodeId }: { nodeId: string }) {
  const api = useApiClient();
  const history = useQuery({
    queryKey: ["discovery-history", nodeId],
    queryFn: () => api.getDiscoveryHistory({ nodeId }),
    retry: false,
  });
  if (!history.data) return null;
  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Recent changes</summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
        {history.data.map((entry) => (
          <li key={entry.id}>
            {new Date(entry.recordedAt).toLocaleDateString()} · {historyLabel(entry.action)}
          </li>
        ))}
      </ul>
    </details>
  );
}
function historyLabel(action: string) {
  if (action.startsWith("Luma connected")) return "Connected a Luma calendar";
  if (action === "Luma calendar disconnected") return "Disconnected Luma";
  if (action === "moderation: unpublish") return "Hidden from Explore";
  if (action === "profile published") return "Published this community";
  if (action === "profile saved as draft") return "Saved as a draft";
  if (action.endsWith(" published")) return "Published";
  if (action.endsWith(" draft")) return "Saved a draft";
  if (action.endsWith(" cancelled")) return "Marked as cancelled";
  return "Updated";
}

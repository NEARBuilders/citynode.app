import {
  ArrowUpRightIcon,
  BroadcastIcon,
  CalendarDotsIcon,
  CopyIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/app";
import { Badge, Button, Input } from "@/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ActivityCard, EventCalendar } from "./activity-editor";
import { useDiscoveryMeasurement } from "./discovery-measurement";
import { ReportContent } from "./report-content";

const GeographicMap = lazy(() =>
  import("./geographic-map")
    .then((m) => ({ default: m.GeographicMap }))
    .catch(() => ({
      default: () => <p role="status">Map isn’t available. Use the list instead.</p>,
    })),
);
export type DiscoverySearch = {
  campaign?: string;
  node?: string;
  query?: string;
  active?: boolean;
  upcoming?: boolean;
  region?: string;
};
export function DiscoveryExplorer({
  api,
  search,
  navigate,
}: {
  api: ApiClient;
  search: DiscoverySearch;
  navigate: (search: DiscoverySearch) => void;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const measurement = useDiscoveryMeasurement(api, search.campaign);
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    if (search.node) measurement.track("open", search.node);
  }, [search.node, measurement.track]);
  const origin = useRef<HTMLElement | null>(null);
  const lastNode = useRef<string | undefined>(undefined);
  if (search.node) lastNode.current = search.node;
  const nodeId = search.node ?? lastNode.current;
  const list = useQuery({
    queryKey: ["discovery", search.query, search.region, search.active, search.upcoming],
    queryFn: () =>
      api.listDiscovery({
        query: search.query,
        region: search.region,
        active: search.active,
        upcoming: search.upcoming,
      }),
    refetchInterval: 30_000,
    // Keeps the list and map mounted while a new search loads, instead of
    // swapping in the pending state and rebuilding the map on each keystroke.
    placeholderData: keepPreviousData,
  });
  const regions = useQuery({
    queryKey: ["discovery", undefined, undefined, undefined, undefined],
    queryFn: () => api.listDiscovery({}),
    staleTime: 30_000,
  });
  const detail = useQuery({
    queryKey: ["discovery-node", nodeId],
    queryFn: () => api.getDiscoveryNode({ nodeId: nodeId! }),
    enabled: !!nodeId,
    refetchInterval: search.node ? 30_000 : false,
  });
  const selected = detail.data;
  const select = (node: string) => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    navigate({ ...search, node });
  };
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Explore</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Communities, upcoming events, and where people are gathering.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-border-strong bg-card p-2">
        <div className="relative min-w-48 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only" htmlFor="discovery-search">
            Search communities
          </label>
          <Input
            id="discovery-search"
            className="h-10 border-0 bg-transparent pl-10 shadow-none"
            value={search.query ?? ""}
            onChange={(e) => navigate({ ...search, query: e.target.value || undefined })}
            placeholder="Search a community or city"
          />
        </div>
        <label className="flex items-center gap-2 px-2 text-sm" htmlFor="discovery-region">
          <GlobeIcon className="size-4 text-muted-foreground" />
          <span className="sr-only">Region</span>
          <select
            id="discovery-region"
            aria-label="Region"
            className="h-10 max-w-40 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={search.region ?? ""}
            onChange={(e) => navigate({ ...search, region: e.target.value || undefined })}
          >
            <option value="">All regions</option>
            {[...new Set([...(regions.data ?? []).map((node) => node.region), search.region ?? ""])]
              .filter(Boolean)
              .sort()
              .map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
          </select>
        </label>
        {[
          { key: "active", label: "Recently active", icon: BroadcastIcon },
          { key: "upcoming", label: "Upcoming events", icon: CalendarDotsIcon },
        ].map(({ key, label, icon: Icon }) => (
          <label key={key} className="cursor-pointer">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={!!search[key as "active" | "upcoming"]}
              onChange={(e) => navigate({ ...search, [key]: e.target.checked || undefined })}
            />
            <span className="flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm text-muted-foreground hover:bg-muted peer-checked:bg-secondary peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <Icon className="size-4" />
              {label}
            </span>
          </label>
        ))}
      </div>
      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-border p-10 text-center"
        >
          <p>Couldn’t load communities.</p>
          <Button onClick={() => list.refetch()}>Try again</Button>
        </div>
      ) : list.isPending ? (
        <div
          role="status"
          className="flex h-[28rem] items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground"
        >
          Finding communities…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
          <section
            aria-label="Communities"
            className="order-2 flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-border-strong bg-card lg:order-1 lg:max-h-[640px]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">
                {list.data.length} {list.data.length === 1 ? "community" : "communities"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {list.data.filter((node) => node.active).length} active
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.data.map((node) => (
                <button
                  type="button"
                  key={node.nodeId}
                  data-testid={`discovery-node-${node.nodeId}`}
                  data-node-id={node.nodeId}
                  aria-pressed={search.node === node.nodeId}
                  onClick={() => select(node.nodeId)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-left last:border-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    search.node === node.nodeId && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      node.active ? "bg-primary" : "bg-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{node.name}</span>
                      {node.featured && (
                        <Badge variant="secondary">
                          <SparkleIcon />
                          {node.featured}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3" />
                      {node.location || "Location not provided"}
                      {node.region ? ` · ${node.region}` : ""}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {node.upcoming
                        ? "Upcoming event"
                        : node.active
                          ? "Recently active"
                          : "Quiet lately"}
                    </span>
                  </span>
                </button>
              ))}
              {!list.data.length && (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                  <p className="font-medium">No communities match these filters.</p>
                  <p className="text-sm text-muted-foreground">
                    Try another city or broaden your search.
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => navigate({ node: search.node, campaign: search.campaign })}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </section>
          <div className="order-1 min-w-0 overflow-hidden rounded-2xl border-2 border-border-strong bg-card lg:order-2">
            <Suspense
              fallback={
                <div className="flex h-[28rem] items-center justify-center text-sm text-muted-foreground lg:h-[640px]">
                  Loading map…
                </div>
              }
            >
              <GeographicMap nodes={list.data} onSelect={select} selectedId={search.node} />
            </Suspense>
          </div>
        </div>
      )}
      <Sheet
        open={!!search.node}
        onOpenChange={(open) => {
          if (!open) navigate({ ...search, node: undefined });
        }}
      >
        <SheetContent
          side={mobile ? "bottom" : "right"}
          className="w-full overflow-y-auto sm:max-w-lg"
          finalFocus={() => {
            const restore = origin.current;
            const id = lastNode.current;
            queueMicrotask(() => {
              if (restore?.isConnected) restore.focus();
              else document.querySelector<HTMLButtonElement>(`[data-node-id="${id}"]`)?.focus();
            });
            return false;
          }}
        >
          <SheetHeader className="px-6 pb-4 pt-8 pr-16">
            <SheetTitle className="text-2xl tracking-tight">
              {selected?.name ?? "Community"}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" />
              {selected?.location || "Location coming soon"}
            </SheetDescription>
          </SheetHeader>
          {search.node && detail.isPending && !selected ? (
            <p className="px-6 text-sm text-muted-foreground">Loading…</p>
          ) : detail.isError ? (
            <p role="alert" className="px-6">
              Couldn’t load this community.
            </p>
          ) : !selected ? (
            search.node ? (
              <p className="px-6">This community isn’t available.</p>
            ) : null
          ) : (
            <div className="flex flex-col gap-8 px-6 pb-8">
              <div className="flex flex-wrap gap-2">
                {selected.featured && (
                  <Badge>
                    <SparkleIcon />
                    {selected.featured}
                  </Badge>
                )}
                <Badge variant={selected.active ? "success" : "secondary"}>
                  <BroadcastIcon />
                  {selected.activityReason}
                </Badge>
              </div>
              {selected.summary ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{selected.summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This community has not added a description yet.
                </p>
              )}
              {selected.channels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selected.channels.map((channel) => (
                    <Button
                      key={channel.url}
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          onClick={() => measurement.track("channel", selected.nodeId, channel.url)}
                          href={channel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      {channel.label}
                      <ArrowUpRightIcon />
                    </Button>
                  ))}
                </div>
              )}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold">Upcoming events</h2>
                {selected.events.length ? (
                  <EventCalendar
                    events={selected.events}
                    nodeId={selected.nodeId}
                    campaign={search.campaign}
                    onOutbound={(activity) => {
                      if (activity.kind === "event")
                        measurement.track("event", selected.nodeId, activity.id);
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No upcoming events. Check back for the next gathering.
                  </p>
                )}
              </section>
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold">Latest updates</h2>
                {selected.updates.length ? (
                  <div className="flex flex-col overflow-hidden rounded-xl bg-muted/50">
                    {selected.updates.map((a) => (
                      <ActivityCard
                        key={a.id}
                        activity={a}
                        nodeId={selected.nodeId}
                        campaign={search.campaign}
                        onOutbound={() => {
                          if (a.kind === "event") measurement.track("event", selected.nodeId, a.id);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No updates yet.</p>
                )}
              </section>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to="/n/$slug"
                      params={{ slug: selected.slug }}
                      search={{ parentId: selected.parentId ?? undefined }}
                    />
                  }
                >
                  Community page
                  <ArrowUpRightIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setShareMessage("Link copied.");
                      measurement.track("share", selected.nodeId);
                    } catch {
                      setShareMessage("Copy the address from your browser to share this page.");
                    }
                  }}
                >
                  <CopyIcon /> Copy link
                </Button>
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                {shareMessage}
              </p>
              <ReportContent targetId={selected.nodeId} kind="profile" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

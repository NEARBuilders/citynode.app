import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/app";
import { Button, Input } from "@/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActivityCard } from "./activity-editor";
import { MeasurementPreference, useDiscoveryMeasurement } from "./discovery-measurement";
import { ReportContent } from "./report-content";

const GeographicMap = lazy(() =>
  import("./geographic-map")
    .then((m) => ({ default: m.GeographicMap }))
    .catch(() => ({
      default: () => <p role="status">Map is unavailable. Use the node list below.</p>,
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
  });
  const detail = useQuery({
    queryKey: ["discovery-node", search.node],
    queryFn: () => api.getDiscoveryNode({ nodeId: search.node! }),
    enabled: !!search.node,
    refetchInterval: 30_000,
  });
  const selected = detail.data;
  const select = (node: string) => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    navigate({ ...search, node });
  };
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Explore City Nodes</h1>
        <Link to="/discovery-studio" className="text-sm underline">
          Discovery studio
        </Link>
        <p className="text-muted-foreground">
          Find a community. See what’s happening. Get involved.
        </p>
      </header>
      <MeasurementPreference consent={measurement.consent} choose={measurement.choose} />
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1" htmlFor="discovery-explorer-1">
          Search nodes
          <Input
            id="discovery-explorer-1"
            value={search.query ?? ""}
            onChange={(e) => navigate({ ...search, query: e.target.value || undefined })}
            placeholder="Name or city"
          />
        </label>
        <label className="space-y-1" htmlFor="discovery-explorer-2">
          Region
          <Input
            id="discovery-explorer-2"
            value={search.region ?? ""}
            onChange={(e) => navigate({ ...search, region: e.target.value || undefined })}
            placeholder="Country or region"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!search.active}
            onChange={(e) => navigate({ ...search, active: e.target.checked || undefined })}
          />
          Active nodes
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!search.upcoming}
            onChange={(e) => navigate({ ...search, upcoming: e.target.checked || undefined })}
          />
          Upcoming events
        </label>
      </div>
      {list.isError ? (
        <p role="alert">
          Unable to load nodes. <Button onClick={() => list.refetch()}>Try again</Button>
        </p>
      ) : list.isPending ? (
        <p role="status">Loading nodes…</p>
      ) : (
        <>
          <Suspense fallback={<p>Loading map…</p>}>
            <GeographicMap nodes={list.data} onSelect={select} />
          </Suspense>
          <section aria-label="Node list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.map((node) => (
              <button
                type="button"
                key={node.nodeId}
                data-testid={`discovery-node-${node.nodeId}`}
                data-node-id={node.nodeId}
                onClick={() => select(node.nodeId)}
                className="rounded-xl border border-border bg-card p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="font-semibold">{node.name}</h2>
                {node.featured && <p>Featured · {node.featured}</p>}
                <p className="text-sm">
                  {node.active ? "Active · " : ""}
                  {node.activityReason}
                </p>
                <p>
                  {node.location || "Location not provided"} · {node.kind}
                </p>
                <p className="text-sm text-muted-foreground">{node.summary}</p>
              </button>
            ))}
          </section>
          {!list.data.length && <p>No nodes match these filters.</p>}
        </>
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
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (origin.current?.isConnected) origin.current.focus();
            else
              document.querySelector<HTMLButtonElement>(`[data-node-id="${search.node}"]`)?.focus();
          }}
        >
          <SheetHeader className="p-4 pr-16">
            <SheetTitle>{selected?.name ?? "Node details"}</SheetTitle>
            <SheetDescription>{selected?.location || "Community discovery"}</SheetDescription>
          </SheetHeader>
          {detail.isPending ? (
            <p>Loading node…</p>
          ) : detail.isError ? (
            <p role="alert">Unable to load this node.</p>
          ) : !selected ? (
            <p>This node is unavailable.</p>
          ) : (
            <div className="space-y-5 p-4">
              <p>{selected.summary}</p>
              <ReportContent targetId={selected.nodeId} kind="profile" />
              <p>{selected.activityReason}</p>
              <h2 className="font-semibold">Upcoming events</h2>
              {selected.events.length ? (
                selected.events.map((a) => (
                  <ActivityCard
                    key={a.id}
                    activity={a}
                    nodeId={selected.nodeId}
                    campaign={search.campaign}
                    onOutbound={() => {
                      if (a.kind === "event") measurement.track("event", selected.nodeId, a.id);
                    }}
                  />
                ))
              ) : (
                <p>No upcoming events.</p>
              )}
              <h2 className="font-semibold">Latest social updates</h2>
              {selected.updates.length ? (
                selected.updates.map((a) => (
                  <ActivityCard
                    key={a.id}
                    activity={a}
                    nodeId={selected.nodeId}
                    campaign={search.campaign}
                    onOutbound={() => {
                      if (a.kind === "event") measurement.track("event", selected.nodeId, a.id);
                    }}
                  />
                ))
              ) : (
                <p>No social updates yet.</p>
              )}
              <div className="flex flex-wrap gap-3">
                {selected.channels.map((channel) => (
                  <a
                    key={channel.url}
                    onClick={() => measurement.track("channel", selected.nodeId, channel.url)}
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {channel.label}
                  </a>
                ))}
              </div>
              <Link
                to="/n/$slug"
                params={{ slug: selected.slug }}
                search={{ parentId: selected.parentId ?? undefined }}
                className="underline"
              >
                Full node page
              </Link>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setShareMessage("Node link copied.");
                    measurement.track("share", selected.nodeId);
                  } catch {
                    setShareMessage("Copy the address from your browser to share this node.");
                  }
                }}
              >
                Copy node link
              </Button>
              <p role="status">{shareMessage}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

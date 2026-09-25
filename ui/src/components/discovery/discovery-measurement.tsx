import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { type ApiClient, useApiClient } from "@/app";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Kind = "open" | "event" | "channel" | "share";
export function useDiscoveryMeasurement(api: ApiClient, campaign = "") {
  const queue = useRef(Promise.resolve());
  const track = useCallback(
    (kind?: Kind, nodeId?: string, target = "") => {
      if (typeof navigator === "undefined" || navigator.doNotTrack === "1") return;
      queue.current = queue.current.then(async () => {
        let visit: { id: string; started: number; campaign: string } | undefined;
        try {
          const raw = sessionStorage.getItem("discovery-visit");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              typeof parsed.id === "string" &&
              typeof parsed.started === "number" &&
              typeof parsed.campaign === "string"
            )
              visit = parsed;
          }
          if (!visit || Date.now() - visit.started > 30 * 60000 || visit.campaign !== campaign) {
            visit = { id: crypto.randomUUID(), started: Date.now(), campaign };
            sessionStorage.setItem("discovery-visit", JSON.stringify(visit));
          }
          await api.trackDiscovery({
            visitId: visit.id,
            campaign,
            kind: "visit",
            nodeId: null,
            target: "",
            consent: true,
          });
          if (kind && nodeId)
            await api.trackDiscovery({
              visitId: visit.id,
              campaign,
              kind,
              nodeId,
              target,
              consent: true,
            });
        } catch {}
      });
    },
    [api, campaign],
  );
  useEffect(() => {
    track();
  }, [track]);
  return { track };
}
export function DiscoveryMetrics({ nodes = [] }: { nodes?: { nodeId: string; name: string }[] }) {
  const api = useApiClient();
  const metrics = useQuery({
    queryKey: ["discovery-metrics"],
    queryFn: () => api.getDiscoveryMetrics(),
    retry: false,
  });
  if (metrics.isPending)
    return <p className="text-sm text-muted-foreground">Loading engagement…</p>;
  if (metrics.isError) return <p role="alert">Unable to load engagement reports.</p>;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Engagement</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          Last 28 days
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {metrics.data.visits} visits · {metrics.data.activatedVisits} visits with a link click
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Visits", value: metrics.data.visits, note: "Times people opened Explore" },
          {
            label: "Visits with a link click",
            value: metrics.data.activatedVisits,
            note: "Someone opened an event or community link",
          },
          {
            label: "Link click rate",
            value: `${metrics.data.visits ? Math.round((100 * metrics.data.activatedVisits) / metrics.data.visits) : 0}%`,
            note: "Visits where someone opened a link",
          },
        ].map(({ label, value, note }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="my-3 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        These numbers count visits and clicks on event or community links. They don’t say whether
        someone attended. Known editors aren’t counted, and we skip people who asked not to be
        tracked.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Community</TableHead>
              <TableHead>From</TableHead>
              <TableHead>What they did</TableHead>
              <TableHead>Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.data.rows.map((row) => (
              <TableRow key={`${row.nodeId}:${row.campaign}:${row.kind}`}>
                <TableCell>
                  <span className="font-medium">
                    {nodes.find((node) => node.nodeId === row.nodeId)?.name ??
                      (row.nodeId ? "Unavailable community" : "Network")}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">{row.campaign || "Explore"}</span>
                </TableCell>
                <TableCell>{metricAction(row.kind)}</TableCell>
                <TableCell>
                  <span className="tabular-nums">{row.count}</span>
                </TableCell>
              </TableRow>
            ))}
            {!metrics.data.rows.length && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <span className="text-muted-foreground">
                    No interest yet. Share Explore to see what people open.
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
function metricAction(kind: string) {
  if (kind === "visit") return "Opened Explore";
  if (kind === "open") return "Opened a community";
  if (kind === "event") return "Opened an event";
  if (kind === "channel") return "Opened a community link";
  if (kind === "share") return "Copied a link";
  return kind;
}

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button } from "@/components";

type Kind = "open" | "event" | "channel" | "share";
export function useDiscoveryMeasurement(api: ApiClient, campaign = "") {
  const [consent, setConsent] = useState(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    try {
      setConsent(
        localStorage.getItem("discovery-measurement") === "yes" && navigator.doNotTrack !== "1",
      );
    } catch {}
  }, []);
  const choose = (enabled: boolean) => {
    const allowed = enabled && navigator.doNotTrack !== "1";
    try {
      localStorage.setItem("discovery-measurement", allowed ? "yes" : "no");
    } catch {}
    setConsent(allowed);
  };
  const track = useCallback(
    (kind?: Kind, nodeId?: string, target = "") => {
      if (!consent || navigator.doNotTrack === "1") return;
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
    [api, campaign, consent],
  );
  useEffect(() => {
    track();
  }, [track]);
  return { consent, choose, track };
}
export function MeasurementPreference({
  consent,
  choose,
}: {
  consent: boolean;
  choose: (enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <p>
        Optional anonymous engagement measurement: {consent ? "on" : "off"}. Browsing works either
        way.
      </p>
      <Button variant="outline" onClick={() => choose(!consent)}>
        {consent ? "Turn measurement off" : "Allow measurement"}
      </Button>
    </div>
  );
}
export function DiscoveryMetrics() {
  const api = useApiClient();
  const metrics = useQuery({
    queryKey: ["discovery-metrics"],
    queryFn: () => api.getDiscoveryMetrics(),
    retry: false,
  });
  if (metrics.isPending) return <p>Loading engagement…</p>;
  if (metrics.isError) return <p role="alert">Unable to load engagement reports.</p>;
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Engagement · last 28 days</h2>
      <p>
        {metrics.data.visits} visits · {metrics.data.activatedVisits} activated visits
      </p>
      <p className="text-sm text-muted-foreground">
        Opt-in visits only. Activation means an event or official-channel click, not attendance or a
        follow. Known editors and admins are excluded.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Node</th>
              <th>Campaign</th>
              <th>Action</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {metrics.data.rows.map((row) => (
              <tr key={`${row.nodeId}:${row.campaign}:${row.kind}`}>
                <td className="p-2">{row.nodeId ?? "Network"}</td>
                <td>{row.campaign || "Direct"}</td>
                <td>{row.kind}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

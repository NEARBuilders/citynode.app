import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/app";
import "leaflet/dist/leaflet.css";

type Node = Awaited<ReturnType<ApiClient["listDiscovery"]>>[number];
export function GeographicMap({
  nodes,
  onSelect,
}: {
  nodes: Node[];
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setFailed(false);
    import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const map = L.map(container.current, {
          scrollWheelZoom: false,
          minZoom: 2,
          maxZoom: 18,
        }).setView([20, 0], 2);
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        tiles.on("tileerror", () => setFailed(true));
        const points = nodes.flatMap((node) =>
          node.latitude !== null && node.longitude !== null
            ? [{ node, point: L.latLng(node.latitude, node.longitude) }]
            : [],
        );
        if (points.length)
          map.fitBounds(L.latLngBounds(points.map((p) => p.point)), {
            padding: [35, 35],
            maxZoom: 8,
          });
        const markers = L.layerGroup().addTo(map);
        const draw = () => {
          markers.clearLayers();
          const groups = new Map<string, typeof points>();
          for (const p of points) {
            const pixel = map.project(p.point);
            const key = `${Math.floor(pixel.x / 48)}:${Math.floor(pixel.y / 48)}`;
            groups.set(key, [...(groups.get(key) ?? []), p]);
          }
          for (const group of groups.values()) {
            const first = group[0];
            if (!first) continue;
            const label =
              group.length > 1
                ? `${group.length} nodes near ${first.node.location}`
                : `${first.node.name} (${first.node.kind})`;
            const content = document.createElement("span");
            content.className =
              "flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg";
            content.textContent = group.length > 1 ? String(group.length) : "●";
            const marker = L.marker(first.point, {
              title: label,
              alt: label,
              icon: L.divIcon({ html: content, className: "", iconSize: [32, 32] }),
            }).addTo(markers);
            marker.getElement()?.setAttribute("aria-label", label);
            marker.on("click", () => {
              if (group.length === 1) {
                select.current(first.node.nodeId);
                return;
              }
              const list = document.createElement("div");
              list.className = "flex flex-col gap-2";
              for (const { node } of group) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `${node.name} · ${node.kind}`;
                button.addEventListener("click", () => {
                  select.current(node.nodeId);
                  map.closePopup();
                });
                list.append(button);
              }
              marker.bindPopup(list).openPopup();
            });
          }
        };
        draw();
        map.on("zoomend", draw);
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(container.current);
        dispose = () => {
          observer.disconnect();
          map.remove();
        };
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [nodes]);
  return (
    <section aria-label="Geographic map" className="space-y-2">
      {failed && <p role="status">Map tiles are unavailable. Use the node list below.</p>}
      <div
        ref={container}
        className="relative z-0 h-96 w-full rounded-xl border border-border lg:h-[32rem]"
      />
    </section>
  );
}

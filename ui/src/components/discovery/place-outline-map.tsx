import { useEffect, useRef, useState } from "react";
import { useAppTranslation } from "@/i18n/runtime";
import "leaflet/dist/leaflet.css";
import { type Boundary, boundaryBounds, boundaryLatLngs, simplifyBoundary } from "./map-areas";

export function PlaceOutlineMap({
  name,
  latitude,
  longitude,
  boundary,
}: {
  name: string;
  latitude: number | null;
  longitude: number | null;
  boundary: Boundary | null;
}) {
  const translate = useAppTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setFailed(false);
    import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const start: [number, number] =
          latitude !== null && longitude !== null ? [latitude, longitude] : [20, 0];
        const map = L.map(container.current, {
          scrollWheelZoom: false,
          worldCopyJump: true,
          minZoom: 2,
          maxZoom: 18,
        }).setView(start, latitude !== null ? 4 : 2);
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          referrerPolicy: "origin",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        tiles.on("tileerror", () => setFailed(true));
        if (boundary) {
          const outline = simplifyBoundary(boundary, 6);
          const area = L.polygon(boundaryLatLngs(outline), {
            className: "fill-muted/50 stroke-border",
            fillOpacity: 1,
            opacity: 1,
            weight: 1,
          }).addTo(map);
          area.getElement()?.setAttribute("data-testid", "place-page.boundary");
          const box = boundaryBounds(outline);
          if (box) map.fitBounds(box, { padding: [24, 24], maxZoom: 6 });
        } else if (latitude !== null && longitude !== null) {
          const marker = L.marker([latitude, longitude], { title: name, alt: name });
          marker.addTo(map);
          marker.getElement()?.setAttribute("data-testid", "place-page.pin");
        }
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
  }, [boundary, latitude, longitude, name]);
  return (
    <section
      aria-label={translate("place.boundary")}
      className="overflow-hidden rounded-2xl border border-border"
    >
      {failed && (
        <p role="status" className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          {translate("directory.mapError")}
        </p>
      )}
      <div ref={container} className="relative z-0 h-72 w-full sm:h-96" />
    </section>
  );
}

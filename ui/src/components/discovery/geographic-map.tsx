import { MapPinIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApiClient } from "@/app";
import { Toggle } from "@/components/ui/toggle";
import { useAppTranslation } from "@/i18n/runtime";
import "leaflet/dist/leaflet.css";
import {
  type Boundary,
  type BoundaryMap,
  boundaryBounds,
  boundaryLatLngs,
  mapAreas,
  showsMapAreas,
  simplifyBoundary,
} from "./map-areas";
import {
  clampToWorld,
  type MapPoint,
  type Node,
  type PlacePin,
  toPoints,
  WORLD_BOUNDS,
} from "./map-points";

const BOUNDARY_BATCH = 500;

export function GeographicMap({
  nodes,
  places,
  placePins,
  listed,
  worldCatalog,
  onSelect,
  onSelectPlace,
  onOpenCommunity,
  selectedId,
}: {
  nodes: Node[];
  places: PlacePin[];
  placePins?: PlacePin[];
  listed?: Node[];
  worldCatalog?: boolean;
  onSelect: (id: string) => void;
  onSelectPlace: (slug: string) => void;
  onOpenCommunity: (slug: string) => void;
  selectedId?: string;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const translation = useRef(translate);
  translation.current = translate;
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [showPlaces, setShowPlaces] = useState(false);
  const [viewport, setViewport] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const select = useRef(onSelect);
  const selectPlace = useRef(onSelectPlace);
  const openCommunity = useRef(onOpenCommunity);
  const selected = useRef(selectedId);
  const redraw = useRef<() => void>(undefined);
  const apply =
    useRef<(points: MapPoint[], boundaries: BoundaryMap, zoom: number, world: boolean) => void>(
      undefined,
    );
  const worldRef = useRef(worldCatalog === true);
  const mapRef = useRef<{ panTo: (latlng: [number, number]) => void } | null>(null);
  const pointsRef = useRef<MapPoint[]>([]);
  const boundariesRef = useRef<BoundaryMap>(new Map());
  const zoomRef = useRef(zoom);
  select.current = onSelect;
  selectPlace.current = onSelectPlace;
  openCommunity.current = onOpenCommunity;
  selected.current = selectedId;
  zoomRef.current = zoom;
  const points = useMemo(
    () =>
      toPoints(
        nodes,
        places,
        listed ?? nodes,
        placePins ?? places,
        showPlaces || worldCatalog !== true,
      ),
    [nodes, places, listed, placePins, showPlaces, worldCatalog],
  );
  pointsRef.current = points;
  worldRef.current = worldCatalog === true;
  const [catalog, setCatalog] = useState<Map<string, Boundary | null>>(() => new Map());
  const missing = useMemo(() => {
    if (!showsMapAreas(zoom)) return [];
    const visible = points.filter((point) => {
      if (!point.placeId || catalog.has(point.placeId)) return false;
      if (!viewport) return true;
      return (
        point.latitude >= viewport.south &&
        point.latitude <= viewport.north &&
        point.longitude >= viewport.west &&
        point.longitude <= viewport.east
      );
    });
    return [...new Set(visible.map((point) => point.placeId).filter((id): id is string => !!id))]
      .sort()
      .slice(0, BOUNDARY_BATCH);
  }, [points, catalog, zoom, viewport]);
  const boundariesQuery = useQuery({
    queryKey: ["place-boundaries", missing.join(",")],
    queryFn: async () => {
      const rows = await api.listPlaceBoundaries({ placeIds: missing });
      const found = new Map(rows.map((row) => [row.placeId, row.boundary] as const));
      return missing.map((id) => [id, found.get(id) ?? null] as const);
    },
    enabled: missing.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    const fetched = boundariesQuery.data;
    if (!fetched?.length) return;
    setCatalog((current) => new Map([...current, ...fetched]));
  }, [boundariesQuery.data]);
  const boundaries = useMemo(() => {
    const map: BoundaryMap = new Map();
    if (!showsMapAreas(zoom)) return map;
    for (const [placeId, boundary] of catalog) {
      if (boundary) map.set(placeId, simplifyBoundary(boundary, zoom));
    }
    return map;
  }, [catalog, zoom]);
  boundariesRef.current = boundaries;
  useEffect(() => {
    // KEEP: the map is created once; rebuilding on refetch flashes and loses the viewport.
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
          maxBounds: WORLD_BOUNDS,
          maxBoundsViscosity: 1,
        }).setView([20, 0], 2);
        mapRef.current = {
          panTo: (latlng) => map.panTo(latlng, { animate: true }),
        };
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          noWrap: true,
          bounds: WORLD_BOUNDS,
          referrerPolicy: "origin",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        tiles.on("tileerror", () => setFailed(true));
        let drawn: { point: MapPoint; latlng: ReturnType<typeof L.latLng> }[] = [];
        let shapes: { id: string; layers: ReturnType<typeof L.polygon>[] }[] = [];
        let fitted = "";
        const regions = L.layerGroup().addTo(map);
        const markers = L.layerGroup().addTo(map);
        const syncViewport = () => {
          const box = map.getBounds();
          setZoom(map.getZoom());
          setViewport({
            south: box.getSouth(),
            west: box.getWest(),
            north: box.getNorth(),
            east: box.getEast(),
          });
        };
        const clickPoint = (point: MapPoint) => {
          if (point.kind === "community" && point.nodeId) {
            select.current(point.nodeId);
            return;
          }
          if (point.activated) {
            openCommunity.current(point.slug);
            return;
          }
          selectPlace.current(point.slug);
        };
        const draw = () => {
          for (const { id, layers } of shapes) {
            const active = id === selected.current;
            for (const layer of layers) {
              layer.setStyle({ weight: active ? 2 : 1 });
              layer.getElement()?.setAttribute("data-active", String(active));
            }
          }
          markers.clearLayers();
          const groups = new Map<string, typeof drawn>();
          for (const entry of drawn) {
            const pixel = map.project(entry.latlng);
            const key = `${Math.floor(pixel.x / 48)}:${Math.floor(pixel.y / 48)}`;
            groups.set(key, [...(groups.get(key) ?? []), entry]);
          }
          for (const group of groups.values()) {
            const first = group[0];
            if (!first) continue;
            const active = group.some(
              (entry) =>
                entry.point.nodeId === selected.current || entry.point.id === selected.current,
            );
            const availableOnly = group.every((entry) => !entry.point.activated);
            const label =
              group.length > 1
                ? translation.current(
                    group.every((entry) => entry.point.activated)
                      ? "directory.communitiesNear"
                      : "explore.places.near",
                    {
                      count: group.length,
                      location: first.point.location ?? first.point.name,
                    },
                  )
                : first.point.name;
            const size = availableOnly ? 20 : 32;
            const content = document.createElement("span");
            content.className = `flex items-center justify-center rounded-full border-2 text-xs font-semibold shadow-lg ${
              active
                ? "border-primary bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
                : availableOnly
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-background bg-primary text-primary-foreground"
            }`;
            content.style.width = `${size}px`;
            content.style.height = `${size}px`;
            content.textContent = group.length > 1 ? String(group.length) : "";
            const marker = L.marker(first.latlng, {
              title: label,
              alt: label,
              zIndexOffset: availableOnly ? 0 : 1000,
              icon: L.divIcon({ html: content, className: "", iconSize: [size, size] }),
            }).addTo(markers);
            const element = marker.getElement();
            element?.setAttribute("aria-label", label);
            element?.setAttribute("aria-current", active ? "true" : "false");
            element?.setAttribute(
              "data-testid",
              first.point.kind === "community" && first.point.nodeId
                ? `discovery-map-marker-${first.point.nodeId}`
                : `discovery-map-place-${first.point.slug}`,
            );
            bindSelect(marker, group);
          }
        };
        const bindSelect = (marker: ReturnType<typeof L.marker>, group: typeof drawn) => {
          const first = group[0];
          if (!first) return;
          marker.on("click", () => {
            if (group.length === 1) {
              clickPoint(first.point);
              return;
            }
            const list = document.createElement("div");
            list.className = "flex max-h-64 flex-col gap-1 overflow-y-auto";
            for (const { point } of group) {
              const button = document.createElement("button");
              button.type = "button";
              button.dataset.testid =
                point.kind === "community" && point.nodeId
                  ? `discovery-cluster-node-${point.nodeId}`
                  : `discovery-cluster-place-${point.slug}`;
              button.className = "rounded-lg px-3 py-2 text-left text-sm hover:bg-muted";
              button.textContent = point.name;
              button.addEventListener("click", () => {
                marker.getElement()?.focus();
                clickPoint(point);
                map.closePopup();
              });
              list.append(button);
            }
            marker.bindPopup(list).openPopup();
          });
        };
        const outline = (boundary: Boundary, className: string, testId: string) => {
          const area = L.polygon(boundaryLatLngs(boundary), {
            className,
            fillOpacity: 1,
            opacity: 1,
            weight: 1,
          }).addTo(regions);
          area.getElement()?.setAttribute("aria-hidden", "true");
          area.getElement()?.setAttribute("data-testid", testId);
          return area;
        };
        const update = (
          next: MapPoint[],
          currentBoundaries: BoundaryMap,
          currentZoom: number,
          world: boolean,
        ) => {
          drawn = next.map((point) => ({
            point,
            latlng: L.latLng(point.latitude, point.longitude),
          }));
          const areaNodes = next
            .filter(
              (point): point is MapPoint & { nodeId: string } =>
                point.kind === "community" && Boolean(point.nodeId),
            )
            .map((point) => ({
              nodeId: point.nodeId,
              name: point.name,
              placeId: point.placeId,
            }));
          const areas = showsMapAreas(currentZoom) ? mapAreas(areaNodes, currentBoundaries) : [];
          const extraAreas = showsMapAreas(currentZoom)
            ? next.flatMap((point) => {
                if (point.kind !== "place" || !point.placeId) return [];
                const boundary = currentBoundaries.get(point.placeId);
                return boundary ? [{ point, boundary }] : [];
              })
            : [];
          regions.clearLayers();
          shapes = [
            ...areas.map(({ node, boundary }) => ({
              id: node.nodeId,
              layers: [
                outline(
                  boundary,
                  "fill-brand/35 stroke-brand-strong hover:fill-brand/45 data-[active=true]:fill-brand/55",
                  `discovery-map-area-${node.nodeId}`,
                )
                  .bindTooltip(node.name, { direction: "top", sticky: true })
                  .on("click", () => select.current(node.nodeId)),
              ],
            })),
            ...extraAreas.map(({ point, boundary }) => ({
              id: point.id,
              layers: [
                outline(
                  boundary,
                  point.activated
                    ? "fill-brand/35 stroke-brand-strong hover:fill-brand/45 data-[active=true]:fill-brand/55"
                    : "fill-muted/50 stroke-border hover:fill-muted",
                  `discovery-map-place-area-${point.slug}`,
                ).on("click", () => clickPoint(point)),
              ],
            })),
          ];
          const key = `${world ? "world" : "fit"}:${next
            .filter((point) => !world || point.activated)
            .map((point) => point.id)
            .sort()
            .join(",")}`;
          if (key !== fitted) {
            fitted = key;
            const outlines = new Map(
              areas.map((area) => [area.node.nodeId, clampToWorld(boundaryBounds(area.boundary))]),
            );
            for (const extra of extraAreas)
              outlines.set(extra.point.id, clampToWorld(boundaryBounds(extra.boundary)));
            map.stop();
            if (world) {
              map.setView([20, 0], 2, { animate: false });
            } else if (drawn.length) {
              const bounds = L.latLngBounds([]);
              for (const entry of drawn)
                bounds.extend(outlines.get(entry.point.nodeId ?? entry.point.id) ?? entry.latlng);
              map.fitBounds(bounds, {
                padding: [35, 35],
                maxZoom: 8,
                animate: false,
              });
            }
            const focused = drawn.find((entry) => entry.point.nodeId === selected.current);
            if (focused) map.panTo(focused.latlng, { animate: false });
          }
          draw();
        };
        redraw.current = draw;
        apply.current = (next, currentBoundaries, currentZoom, world) =>
          update(next, currentBoundaries, currentZoom, world);
        update(pointsRef.current, boundariesRef.current, zoomRef.current, worldRef.current);
        map.on("zoomend moveend", () => {
          syncViewport();
          draw();
        });
        syncViewport();
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(container.current);
        dispose = () => {
          observer.disconnect();
          map.remove();
          mapRef.current = null;
          redraw.current = undefined;
          apply.current = undefined;
        };
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
  useEffect(() => {
    apply.current?.(points, boundariesRef.current, zoom, worldRef.current);
  }, [points, zoom, worldCatalog]);
  useEffect(() => {
    if (boundaries.size > 0)
      apply.current?.(pointsRef.current, boundaries, zoomRef.current, worldRef.current);
  }, [boundaries]);
  useEffect(() => {
    redraw.current?.();
  }, [translate]);
  useEffect(() => {
    redraw.current?.();
    const point = pointsRef.current.find((entry) => entry.nodeId === selectedId);
    if (point) mapRef.current?.panTo([point.latitude, point.longitude]);
  }, [selectedId]);
  return (
    <section aria-label={translate("directory.map")} className="flex flex-col">
      {failed && (
        <p role="status" className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          {translate("directory.mapError")}
        </p>
      )}
      {worldCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className="size-3 rounded-full border-2 border-background bg-primary"
            />
            {translate("explore.map.live")}
          </span>
          <Toggle
            variant="outline"
            size="sm"
            data-testid="explore-map-show-places"
            pressed={showPlaces}
            onPressedChange={setShowPlaces}
          >
            <MapPinIcon />
            {translate("explore.map.showPlaces")}
          </Toggle>
        </div>
      )}
      <div ref={container} className="relative z-0 h-87.5 w-full sm:h-110 lg:h-160" />
    </section>
  );
}

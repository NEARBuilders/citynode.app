// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { GeographicMap } from "./geographic-map";

vi.mock("@/app", () => ({
  useApiClient: () => ({ listPlaceBoundaries: async () => [] }),
}));

type Props = Parameters<typeof GeographicMap>[0];

const places = [
  {
    id: "p-lagos",
    name: "Lagos",
    slug: "lagos",
    latitude: 6.5,
    longitude: 3.4,
    activated: false,
    nodeId: null,
  },
  {
    id: "p-lima",
    name: "Lima",
    slug: "lima",
    latitude: -12,
    longitude: -77,
    activated: false,
    nodeId: null,
  },
  {
    id: "p-nyc",
    name: "New York City",
    slug: "new-york-city",
    latitude: 40.7,
    longitude: -74,
    activated: true,
    nodeId: "nyc",
  },
] as Props["places"];

const nodes = [
  {
    nodeId: "nyc",
    name: "New York City",
    slug: "nyc",
    placeId: "p-nyc",
    location: "New York",
    latitude: null,
    longitude: null,
  },
] as Props["nodes"];

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function show(props: Partial<Props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GeographicMap
        nodes={nodes}
        places={places}
        worldCatalog
        onSelect={() => {}}
        onSelectPlace={() => {}}
        onOpenCommunity={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("GeographicMap", () => {
  it("draws each live community once and hides empty places until asked", async () => {
    const view = show();
    await waitFor(() => expect(screen.getByTestId("discovery-map-marker-nyc")).toBeTruthy());
    expect(view.container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);
    expect(screen.queryByTestId("discovery-map-place-lagos")).toBeNull();

    fireEvent.click(screen.getByTestId("explore-map-show-places"));

    await waitFor(() => expect(screen.getByTestId("discovery-map-place-lagos")).toBeTruthy());
    expect(view.container.querySelectorAll(".leaflet-marker-icon").length).toBeLessThanOrEqual(3);
  });

  it("shows matching places without the toggle when the list is filtered", async () => {
    show({ worldCatalog: false, placePins: [places[0]!] });
    await waitFor(() => expect(screen.getByTestId("discovery-map-place-lagos")).toBeTruthy());
    expect(screen.queryByTestId("explore-map-show-places")).toBeNull();
  });
});

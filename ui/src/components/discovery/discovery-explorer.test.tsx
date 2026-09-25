// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { DiscoveryExplorer, type DiscoverySearch } from "./discovery-explorer";

vi.mock("./discovery-measurement", () => ({
  useDiscoveryMeasurement: () => ({ track: vi.fn() }),
}));

const community = {
  nodeId: "00000000-0000-4000-8000-000000000001",
  name: "Chicago",
  slug: "chicago",
  parentId: null,
  kind: "city",
  summary: "Builders in Chicago.",
  location: "Chicago, IL",
  region: "North America",
  latitude: null,
  longitude: null,
  channels: [],
  published: true,
  featured: null,
  active: true,
  activityReason: "Recently active",
  upcoming: false,
  events: [],
  updates: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderExplorer(search: DiscoverySearch) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  const api = {
    listDiscovery: vi.fn(async () => [community]),
    getDiscoveryNode: vi.fn(async () => null),
  } as unknown as ApiClient;
  const navigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DiscoveryExplorer api={api} search={search} navigate={navigate} />
    </QueryClientProvider>,
  );
  return navigate;
}

it("lists communities as cards that open the preview", async () => {
  const navigate = renderExplorer({});
  const card = await screen.findByTestId(`discovery-node-${community.nodeId}`);
  expect(card.textContent).toContain("Chicago, IL");
  expect(screen.getByText("1 community")).toBeTruthy();
  fireEvent.click(card);
  expect(navigate).toHaveBeenCalledWith({ node: community.nodeId });
});

it("switches to the map view through the search params", async () => {
  const navigate = renderExplorer({ query: "chi" });
  await screen.findByTestId(`discovery-node-${community.nodeId}`);
  fireEvent.click(screen.getByTestId("explore-view-map"));
  expect(navigate).toHaveBeenCalledWith({ query: "chi", view: "map" });
});

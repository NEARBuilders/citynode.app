// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { ActivityDetail } from "./activity-detail";

const api = vi.hoisted(() => ({
  getDiscoveryActivity: vi.fn(),
  getDiscoveryNode: vi.fn(),
}));

vi.mock("@/app", async () => ({
  ...(await vi.importActual<typeof import("@/app")>("@/app")),
  useApiClient: () => api,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, "data-testid": testId }: { children?: ReactNode; "data-testid"?: string }) => (
    <a href="/" data-testid={testId}>
      {children}
    </a>
  ),
}));

const nodeId = "00000000-0000-4000-8000-000000000002";

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000000e1",
    ownerNodeId: nodeId,
    nodeIds: [nodeId],
    kind: "event",
    title: "Builders night",
    summary: "",
    url: "https://lu.ma/builders-night",
    source: "Luma",
    luma: true,
    publishedAt: "2026-11-01T10:00:00.000Z",
    startsAt: "2099-11-20T18:00:00.000Z",
    endsAt: "2099-11-20T21:00:00.000Z",
    timezone: "UTC",
    venue: "Community hall",
    status: "published",
    ...overrides,
  };
}

function show(data: Record<string, unknown>) {
  api.getDiscoveryActivity.mockResolvedValue(data);
  api.getDiscoveryNode.mockResolvedValue({
    nodeId,
    name: "Chicago",
    slug: "chicago",
    parentId: null,
    location: "Chicago, IL",
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityDetail activityId={String(data.id)} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityDetail", () => {
  it("tells visitors that checking in at the event joins the hosting community", async () => {
    show(activity());
    expect(await screen.findByText("Register on Luma")).toBeTruthy();
    const line = await screen.findByTestId("activity.join-at-event");
    expect(line.textContent).toBe("Check in at an event to join Chicago.");
  });

  it("leaves the join line off cancelled events and updates", async () => {
    show(activity({ status: "cancelled" }));
    await screen.findByTestId("activity.host");
    expect(screen.queryByTestId("activity.join-at-event")).toBeNull();
    cleanup();

    show(activity({ kind: "social", luma: false }));
    await screen.findByTestId("activity.host");
    expect(screen.queryByTestId("activity.join-at-event")).toBeNull();
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { ActivityEditor } from "./activity-editor";

const api = vi.hoisted(() => ({
  listDiscoveryActivities: vi.fn(),
  listDiscoveryLumaCalendars: vi.fn(),
}));

vi.mock("@/app", async () => ({
  ...(await vi.importActual<typeof import("@/app")>("@/app")),
  useApiClient: () => api,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    ...props
  }: {
    children?: ReactNode;
    to?: string;
    params?: unknown;
    search?: unknown;
  }) => <a {...props}>{children}</a>,
  useLocation: () => ({ href: "/nodes/n1/content" }),
  useNavigate: () => vi.fn(),
}));

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.clearAllMocks();
});

describe("ActivityEditor", () => {
  it("keeps a loaded list on screen when a background refetch fails", async () => {
    api.listDiscoveryActivities.mockRejectedValue(new TypeError("Failed to fetch"));
    api.listDiscoveryLumaCalendars.mockResolvedValue([]);
    const client = new QueryClient();
    clients.push(client);
    const queryKey = ["discovery-activities", "n1"];
    client.setQueryData(queryKey, []);

    render(
      <QueryClientProvider client={client}>
        <ActivityEditor nodeId="n1" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(client.getQueryState(queryKey)?.status).toBe("error"));
    expect(screen.getByTestId("discovery-new-event")).toBeTruthy();
    expect(screen.queryByTestId("community-load-error")).toBeNull();
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { CommunityStats } from "./-community-overview";

const mocks = vi.hoisted(() => ({
  apiClient: null as unknown,
}));

vi.mock("@/app", () => ({
  useApiClient: () => mocks.apiClient,
}));

type Summary = Parameters<typeof CommunityStats>[0]["summary"];

function summary(overrides: { tenantId?: string | null; validators?: number } = {}): Summary {
  const node = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Lahore",
    slug: "lahore",
    kind: "city",
    parentId: null,
    tenantId: "tenantId" in overrides ? overrides.tenantId : "tenant-1",
    metadata: {},
  };
  return {
    node,
    children: [],
    validators: [],
    stakingValidators: {
      sourceNodeId: node.id,
      validators: Array.from({ length: overrides.validators ?? 1 }, (_, i) => ({
        id: `v${i}`,
      })),
    },
  } as unknown as Summary;
}

function api({
  activities = async () => [] as unknown[],
  orgId = "org-1" as string | null,
  stats = async (_input: { month: string; organizationId?: string }) => ({
    month: "2026-10",
    totals: { redeemed: 0, newMembers: 0 },
    organizations: [] as { organizationId: string; redeemed: number; newMembers: number }[],
  }),
} = {}) {
  const client = {
    listDiscoveryActivities: vi.fn(activities),
    resolveTenantById: vi.fn(async () => ({ id: "tenant-1", orgId, status: "active" })),
    auth: { getOnboardingStats: vi.fn(stats) },
  };
  mocks.apiClient = client;
  return client;
}

function renderStats(value: Summary) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommunityStats summary={value} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("community stats", () => {
  it("shows upcoming and past events and this month's joins", async () => {
    api({
      activities: async () => [
        {
          id: "a",
          kind: "event",
          status: "published",
          startsAt: "2999-01-01T00:00:00Z",
          endsAt: "2999-01-01T02:00:00Z",
        },
        {
          id: "b",
          kind: "event",
          status: "published",
          startsAt: "2020-01-01T00:00:00Z",
          endsAt: "2020-01-01T02:00:00Z",
        },
      ],
      stats: async () => ({
        month: "2026-10",
        totals: { redeemed: 9, newMembers: 5 },
        organizations: [
          { organizationId: "org-1", redeemed: 7, newMembers: 3 },
          { organizationId: "org-2", redeemed: 2, newMembers: 2 },
        ],
      }),
    });
    const client = mocks.apiClient as ReturnType<typeof api>;
    renderStats(summary());

    const events = await screen.findByTestId("admin-node.stat-events");
    await waitFor(() => expect(within(events).getByText("1")).toBeTruthy());
    expect(within(events).getByText("1 past event")).toBeTruthy();
    const redeemed = screen.getByTestId("admin-node.stat-redeemed");
    await waitFor(() => expect(within(redeemed).getAllByText("7")).toHaveLength(1));
    expect(
      within(screen.getByTestId("admin-node.stat-new-members")).getAllByText("3"),
    ).toHaveLength(1);
    expect(client.auth.getOnboardingStats).toHaveBeenCalled();
    for (const [input] of client.auth.getOnboardingStats.mock.calls) {
      expect(input).not.toHaveProperty("organizationId");
    }
  });

  it("shows a failed events load as an error with retry, not zero", async () => {
    const client = api({
      activities: async () => {
        throw new Error("boom");
      },
    });
    renderStats(summary());

    const error = await screen.findByTestId("admin-node.stat-events-error");
    expect(error.textContent).toBe("Couldn't load");
    const stat = screen.getByTestId("admin-node.stat-events");
    expect(within(stat).queryByText("0")).toBeNull();
    fireEvent.click(within(stat).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(client.listDiscoveryActivities).toHaveBeenCalledTimes(2));
  });

  it("shows a failed joins load as an error", async () => {
    api({
      stats: async () => {
        throw new Error("boom");
      },
    });
    renderStats(summary());

    expect(await screen.findByTestId("admin-node.stat-redeemed-error")).toBeTruthy();
    expect(screen.getByTestId("admin-node.stat-new-members-error")).toBeTruthy();
  });

  it("explains missing figures for a community without a site", async () => {
    const client = api();
    renderStats(summary({ tenantId: null, validators: 0 }));

    const events = screen.getByTestId("admin-node.stat-events");
    expect(within(events).getByText("No community site yet")).toBeTruthy();
    expect(
      within(screen.getByTestId("admin-node.stat-staking")).getByText("None set yet"),
    ).toBeTruthy();
    expect(client.listDiscoveryActivities).not.toHaveBeenCalled();
    expect(client.auth.getOnboardingStats).not.toHaveBeenCalled();
  });

  it("explains missing joins when the site has no organization", async () => {
    api({ orgId: null });
    renderStats(summary());

    const redeemed = screen.getByTestId("admin-node.stat-redeemed");
    await waitFor(() => expect(within(redeemed).getByText("No organization yet")).toBeTruthy());
  });
});

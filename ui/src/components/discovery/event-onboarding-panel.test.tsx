// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { EventOnboardingPanel } from "./event-onboarding";

const api = vi.hoisted(() => ({
  listDiscoveryActivities: vi.fn(),
  auth: { listOnboardingCodes: vi.fn(), revokeOnboardingCode: vi.fn() },
  createEventOnboardingCode: vi.fn(),
}));

vi.mock("@/app", async () => ({
  ...(await vi.importActual<typeof import("@/app")>("@/app")),
  useApiClient: () => api,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
  useLocation: () => ({ href: "/dashboard/node" }),
  useNavigate: () => vi.fn(),
}));

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    eventId: null,
    eventName: "Front desk",
    teamId: "team-1",
    role: "member",
    maxUses: 300,
    usedCount: 4,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <EventOnboardingPanel nodeId="node-1" organizationId="org-1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EventOnboardingPanel", () => {
  it("lists a station without an expiry as live and says it has no expiry", async () => {
    api.listDiscoveryActivities.mockResolvedValue([]);
    api.auth.listOnboardingCodes.mockResolvedValue([code("standing")]);

    renderPanel();

    const row = await screen.findByTestId("community-onboarding.station-standing");
    expect(row.textContent).toContain("4 of 300 joined · No expiry");
  });

  it("keeps the time left for a station that expires", async () => {
    api.listDiscoveryActivities.mockResolvedValue([]);
    api.auth.listOnboardingCodes.mockResolvedValue([
      code("dated", { expiresAt: new Date(Date.now() + 2 * 86_400_000 + 3_700_000) }),
    ]);

    renderPanel();

    const row = await screen.findByTestId("community-onboarding.station-dated");
    expect(row.textContent).toContain("4 of 300 joined · 2d 1h left");
  });
});

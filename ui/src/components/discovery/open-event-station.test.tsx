// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { type DiscoveryActivity, OpenEventStationButton } from "./event-onboarding";

const api = vi.hoisted(() => ({
  auth: { listOnboardingCodes: vi.fn() },
  createEventOnboardingCode: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/app", async () => ({
  ...(await vi.importActual<typeof import("@/app")>("@/app")),
  useApiClient: () => api,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
  useLocation: () => ({ href: "/dashboard/node" }),
  useNavigate: () => navigate,
}));

const hour = 3_600_000;
const event = { id: "event-1", kind: "event", title: "Launch Night" } as DiscoveryActivity;

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    eventId: "event-1",
    eventName: "Launch Night",
    teamId: "team-1",
    role: "member",
    maxUses: 300,
    usedCount: 0,
    expiresAt: new Date(Date.now() + hour),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function renderButton() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <OpenEventStationButton event={event} organizationId="org-1" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("dashboard-node.open-station-event-1"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OpenEventStationButton", () => {
  it("labels the overview button Open station for that event", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OpenEventStationButton event={event} organizationId="org-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("dashboard-node.open-station-event-1")).toBeTruthy();
    expect(screen.getByLabelText("Open station for Launch Night")).toBeTruthy();
    expect(screen.getByText("Open station")).toBeTruthy();
  });

  it("opens the event's newest live station instead of starting another", async () => {
    api.auth.listOnboardingCodes.mockResolvedValue([
      code("revoked", { revokedAt: new Date() }),
      code("used-up", { usedCount: 300 }),
      code("newest-live"),
      code("older-live"),
    ]);

    renderButton();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/onboarding/station/$codeId",
          params: { codeId: "newest-live" },
          search: { org: "org-1", from: "/dashboard/node" },
        }),
      ),
    );
    expect(api.auth.listOnboardingCodes).toHaveBeenCalledWith({
      eventId: "event-1",
      organizationId: "org-1",
    });
    expect(api.createEventOnboardingCode).not.toHaveBeenCalled();
  });

  it("starts a station with the default join limit when none is live", async () => {
    api.auth.listOnboardingCodes.mockResolvedValue([
      code("expired", { expiresAt: new Date(Date.now() - hour) }),
    ]);
    api.createEventOnboardingCode.mockResolvedValue(code("started"));

    renderButton();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { codeId: "started" } }),
      ),
    );
    expect(api.createEventOnboardingCode).toHaveBeenCalledWith({ eventId: "event-1" });
  });
});

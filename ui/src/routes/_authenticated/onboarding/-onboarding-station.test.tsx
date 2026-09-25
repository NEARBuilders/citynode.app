// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingStation } from "./-onboarding-station";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

const station = {
  id: "code-1",
  code: "station-code-value",
  eventId: "event-1",
  eventName: "Launch Night",
  teamId: "team-1",
  role: "member",
  maxUses: 120,
  usedCount: 2,
  expiresAt: new Date(Date.now() + 30 * 3_600_000),
  revokedAt: null,
  createdAt: new Date(),
};

function renderStation(getOnboardingStation = vi.fn().mockResolvedValue(station)) {
  const apiClient = {
    auth: {
      getOnboardingStation,
      getOnboardingStatus: vi.fn().mockResolvedValue({
        ...station,
        usedCount: 2,
        joined: [
          { userId: "u-2", userName: "Second Member", accountId: null, createdAt: new Date() },
          { userId: "u-1", userName: null, accountId: "0sabc", createdAt: new Date() },
        ],
      }),
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OnboardingStation
        apiClient={apiClient as never}
        codeId="code-1"
        organizationId="org-1"
        gatewayOrigin="https://citynode.app"
      />
    </QueryClientProvider>,
  );
  return { apiClient };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingStation", () => {
  it("shows a QR that points at the Gateway Origin", async () => {
    renderStation();

    await waitFor(() =>
      expect(screen.getByTestId("station.qr").getAttribute("src")).toBe("data:image/png;base64,qr"),
    );
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      "https://citynode.app/onboard?code=station-code-value",
      expect.anything(),
    );
    expect(screen.getByTestId("station.event-name").textContent).toBe("Launch Night");
  });

  it("shows the live joined count and recent joiners", async () => {
    renderStation();

    await waitFor(() =>
      expect(screen.getByTestId("station.joined-count").textContent).toContain("2 joined"),
    );
    expect(screen.getByTestId("station.recent-joiners").textContent).toContain("Second Member");
    expect(screen.getByTestId("station.recent-joiners").textContent).toContain("New member");
  });

  it("explains when the code can no longer be shown", async () => {
    renderStation(vi.fn().mockRejectedValue(new Error("This onboarding code is no longer active")));

    await waitFor(() =>
      expect(screen.getByTestId("station.unavailable").textContent).toContain("no longer active"),
    );
  });
});

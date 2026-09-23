// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components";
import { OnboardingTab } from "./-onboarding-tab";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

const createdCode = {
  id: "code-1",
  code: "station-code-value",
  eventName: "Launch Night",
  teamId: "team-1",
  role: "member",
  maxUses: 50,
  usedCount: 0,
  expiresAt: new Date(Date.now() + 24 * 3_600_000),
  revokedAt: null,
  createdAt: new Date(),
};

const status = {
  ...createdCode,
  code: undefined,
  usedCount: 1,
  joined: [
    { userId: "user-1", userName: "First Member", accountId: "0sabc", createdAt: new Date() },
  ],
};

function renderTab() {
  const apiClient = {
    auth: {
      listOnboardingCodes: vi.fn().mockResolvedValue([createdCode]),
      createOnboardingCode: vi.fn().mockResolvedValue(createdCode),
      getOnboardingStatus: vi.fn().mockResolvedValue(status),
      revokeOnboardingCode: vi.fn().mockResolvedValue({ success: true }),
    },
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Tabs value="onboard">
        <OnboardingTab apiClient={apiClient as never} canManage orgId="org-1" />
      </Tabs>
    </QueryClientProvider>,
  );
  return { apiClient };
}

afterEach(cleanup);

describe("OnboardingTab", () => {
  it("starts an onboarding station with the event name", async () => {
    const { apiClient } = renderTab();

    fireEvent.change(screen.getByTestId("onboard.event-name-input"), {
      target: { value: "Launch Night" },
    });
    fireEvent.click(screen.getByTestId("onboard.start-button"));

    await waitFor(() =>
      expect(apiClient.auth.createOnboardingCode).toHaveBeenCalledWith({
        eventName: "Launch Night",
        organizationId: "org-1",
      }),
    );
  });

  it("shows the QR station and live joined status after creation", async () => {
    renderTab();

    fireEvent.change(screen.getByTestId("onboard.event-name-input"), {
      target: { value: "Launch Night" },
    });
    fireEvent.click(screen.getByTestId("onboard.start-button"));

    await waitFor(() => expect(screen.getByTestId("onboard.station")).toBeTruthy());
    const qr = screen.getByTestId("onboard.qr").querySelector("img");
    expect(qr?.getAttribute("src")).toBe("data:image/png;base64,qr");

    await waitFor(() =>
      expect(screen.getByTestId("onboard.joined-count").textContent).toContain("1/50 joined"),
    );
    expect(screen.getByTestId("onboard.joined-list").textContent).toContain("First Member");
  });

  it("lists existing onboarding events", async () => {
    renderTab();

    await waitFor(() => expect(screen.getByTestId("onboard.code-code-1")).toBeTruthy());
    expect(screen.getByTestId("onboard.code-code-1").textContent).toContain("Launch Night");
  });
});

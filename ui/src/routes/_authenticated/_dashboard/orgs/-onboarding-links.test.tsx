// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { render } from "@/i18n/test-render";
import { qrFileName } from "@/lib/onboarding-links";
import { OnboardingLinks } from "./-onboarding-links";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ({ href: "/orgs/community" }),
}));
vi.mock("@/lib/onboarding-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding-links")>()),
  useGatewayOrigin: () => "https://citynode.app",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const telegram = {
  id: "link-1",
  slug: "ab23cd45",
  name: "Telegram group",
  destination: "https://t.me/citynode",
  enabled: true,
  visitCount: 3,
  lastVisitedAt: null,
  createdAt: "2026-11-05T00:00:00.000Z",
};

function renderLinks(links = [telegram], isActive = true) {
  const apiClient = {
    listOnboardingLinks: vi.fn(async () => links),
    createOnboardingLink: vi.fn(async (input: { name: string; destination: string }) => ({
      ...telegram,
      id: "link-2",
      ...input,
    })),
    updateOnboardingLink: vi.fn(async (input: { enabled?: boolean }) => ({
      ...telegram,
      ...input,
    })),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <OnboardingLinks
        apiClient={apiClient as unknown as ApiClient}
        orgId="org-1"
        isActive={isActive}
      />
    </QueryClientProvider>,
  );
  return apiClient;
}

afterEach(cleanup);

describe("OnboardingLinks", () => {
  it("lists each link with its short address, destination and scans", async () => {
    renderLinks();

    const row = await screen.findByTestId("links.row-link-1");
    expect(row.textContent).toContain("Telegram group");
    expect(row.textContent).toContain("https://citynode.app/go/ab23cd45");
    expect(row.textContent).toContain("Goes to https://t.me/citynode");
    expect(screen.getByTestId("links.visits-link-1").textContent).toBe("Visits: 3");
    expect(screen.getByTestId("links.show-link-1").getAttribute("href")).toBe(
      "/onboarding/link/$linkId",
    );
  });

  it("creates a link from the name and destination", async () => {
    const apiClient = renderLinks([]);
    await screen.findByText("No links yet");

    fireEvent.change(screen.getByTestId("links.create.name"), {
      target: { value: " Sign-up form " },
    });
    fireEvent.change(screen.getByTestId("links.create.destination"), {
      target: { value: "https://forms.gle/abc" },
    });
    fireEvent.click(screen.getByTestId("links.create.submit"));

    await waitFor(() =>
      expect(apiClient.createOnboardingLink).toHaveBeenCalledWith({
        organizationId: "org-1",
        name: "Sign-up form",
        destination: "https://forms.gle/abc",
      }),
    );
  });

  it("hides the QR and download for a link that's off", async () => {
    renderLinks([{ ...telegram, enabled: false }]);

    const row = await screen.findByTestId("links.row-link-1");
    expect(row.textContent).toContain("Off");
    expect(screen.queryByTestId("links.show-link-1")).toBeNull();
    expect(screen.queryByTestId("links.download-link-1")).toBeNull();
  });

  it("turns a link off from its switch", async () => {
    const apiClient = renderLinks();

    fireEvent.click(await screen.findByTestId("links.toggle-link-1"));

    await waitFor(() =>
      expect(apiClient.updateOnboardingLink).toHaveBeenCalledWith({
        linkId: "link-1",
        organizationId: "org-1",
        enabled: false,
      }),
    );
  });

  it("asks to switch organizations instead of loading another community's links", () => {
    const apiClient = renderLinks([telegram], false);

    expect(screen.getByTestId("links.switch-to-manage")).toBeTruthy();
    expect(screen.queryByTestId("links.create.form")).toBeNull();
    expect(apiClient.listOnboardingLinks).not.toHaveBeenCalled();
  });
});

describe("qrFileName", () => {
  it("names the download after the link", () => {
    expect(qrFileName("Telegram group!")).toBe("telegram-group-qr.png");
    expect(qrFileName("贡献者")).toBe("link-qr.png");
  });
});

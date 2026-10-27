// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/app";
import { render } from "@/i18n/test-render";
import { AppInfoPopover } from "./-app-info-popover";

const session = {
  user: { name: "Ada", email: "ada@example.com", role: "admin" },
} as unknown as SessionData;

const resolveTenant = vi.fn(async () => ({ id: "t1", name: "CityNode", orgId: "org-1" }));
const getOrganizationForAdmin = vi.fn(async () => ({ id: "org-1", slug: "citynode" }));

vi.mock("@/app", () => ({
  getAccount: () => "v1.citynode.near",
  useApiClient: () => ({ resolveTenant, auth: { getOrganizationForAdmin } }),
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => "ada.near",
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

const versionPayload = {
  fingerprint: "75314807fcd105d2",
  slots: {
    "app.api": "versions/03b84ba618696a5b.json",
    "plugins.proposals": "versions/037fac8e9ce0a469.json",
  },
  watch: { lastOutcome: "clean" },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(versionPayload)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPopover() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppInfoPopover session={session} />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("AppInfoPopover", () => {
  it("only fetches the version once the popover is open", async () => {
    renderPopover();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "App info" }));

    const dialog = await screen.findByRole("dialog", { name: "Deployed version" });
    await within(dialog).findByText("75314807fcd105d2");
    expect(fetchMock).toHaveBeenCalledWith("/.well-known/version");
  });

  it("shows the deployed version and every runtime detail", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "App info" }));
    const dialog = await screen.findByRole("dialog", { name: "Deployed version" });

    await within(dialog).findByText("75314807fcd105d2");
    expect(within(dialog).getByText("Up to date")).toBeDefined();
    expect(within(dialog).getByText("plugins.proposals")).toBeDefined();
    expect(within(dialog).getByText("037fac8e9ce0a469")).toBeDefined();
    expect(within(dialog).getByText("This runtime")).toBeDefined();

    const runtime = within(dialog).getByTestId("admin-app-info-runtime");
    expect(within(runtime).getByText("v1.citynode.near")).toBeDefined();
    expect(await within(runtime).findByText("CityNode")).toBeDefined();
    expect(await within(runtime).findByText("citynode")).toBeDefined();
    expect(resolveTenant).toHaveBeenCalledWith({ accountId: "v1.citynode.near" });
    expect(within(runtime).getByText("Ada")).toBeDefined();
    expect(within(runtime).getByText("ada.near")).toBeDefined();
    expect(within(dialog).getByTestId("admin-app-info-role")).toBeDefined();
  });

  it("says when the version endpoint is unreachable", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "App info" }));

    expect(await screen.findByText("Version endpoint unreachable.")).toBeDefined();
    expect(screen.getByText("v1.citynode.near")).toBeDefined();
  });

  it("keeps the last known version when a refetch fails", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(versionPayload)))
      .mockResolvedValue(new Response("", { status: 502 }));
    const queryClient = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "App info" }));
    expect(await screen.findByText("75314807fcd105d2")).toBeDefined();

    await act(() => queryClient.refetchQueries({ queryKey: ["deployed-version"] }));
    await waitFor(() =>
      expect(queryClient.getQueryState(["deployed-version"])?.status).toBe("error"),
    );
    expect(screen.getByText("75314807fcd105d2")).toBeDefined();
    expect(screen.queryByText("Version endpoint unreachable.")).toBeNull();
  });
});

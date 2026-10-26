// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AppInfoPopover, showsAppInfo } from "./app-info-popover";

const resolveTenant = vi.fn(async () => ({ id: "t1", name: "CityNode", orgId: null }));

vi.mock("@/app", () => ({
  getAccount: () => "v1.citynode.near",
  useApiClient: () => ({ resolveTenant, auth: { getOrganizationForAdmin: vi.fn() } }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPopover() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppInfoPopover />
    </QueryClientProvider>,
  );
}

describe("showsAppInfo", () => {
  it("shows the control to platform admins on admin pages", () => {
    expect(showsAppInfo(true, "/admin")).toBe(true);
    expect(showsAppInfo(true, "/admin/relayer")).toBe(true);
  });

  it("hides the control outside admin pages", () => {
    expect(showsAppInfo(true, "/dashboard")).toBe(false);
    expect(showsAppInfo(true, "/administrator")).toBe(false);
  });

  it("hides the control from non-admins", () => {
    expect(showsAppInfo(false, "/admin")).toBe(false);
  });
});

describe("AppInfoPopover", () => {
  it("loads nothing until opened, then shows the runtime and deployed version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fingerprint: "abc123",
          slots: { ui: "ui@1.2.3" },
          watch: { lastOutcome: "clean" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPopover();

    const trigger = screen.getByRole("button", { name: "App info" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolveTenant).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByText("abc123")).toBeDefined());
    expect(screen.getByText("v1.citynode.near")).toBeDefined();
    expect(await screen.findByText("CityNode")).toBeDefined();
    expect(screen.getByText("ui@1.2.3")).toBeDefined();
    expect(screen.getByText("Up to date")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith("/.well-known/version");
  });

  it("says when the version endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    renderPopover();

    fireEvent.click(screen.getByRole("button", { name: "App info" }));
    expect(await screen.findByText("Version endpoint unreachable.")).toBeDefined();
  });
});

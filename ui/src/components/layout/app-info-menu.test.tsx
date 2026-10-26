// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AppInfoMenu, showsAppInfo } from "./app-info-menu";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderMenu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppInfoMenu />
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
    expect(showsAppInfo(false, "/dashboard")).toBe(false);
  });
});

describe("AppInfoMenu", () => {
  it("opens a labelled popover with the deployed version", async () => {
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
    renderMenu();

    const trigger = screen.getByRole("button", { name: "App info" });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Deployed version" });
    expect(dialog).toBeDefined();
    await waitFor(() => expect(screen.getByText("abc123")).toBeDefined());
    expect(screen.getByText("ui@1.2.3")).toBeDefined();
    expect(screen.getByText("Up to date")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith("/.well-known/version");
  });

  it("says when the version endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "App info" }));
    expect(await screen.findByText("Version endpoint unreachable.")).toBeDefined();
  });
});

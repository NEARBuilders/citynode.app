// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AppInfoMenu } from "./app-info-menu";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderMenu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppInfoMenu />
    </QueryClientProvider>,
  );
  return queryClient;
}

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

  it("keeps the last known version when a refetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fingerprint: "abc123" })))
      .mockResolvedValue(new Response("", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "App info" }));
    expect(await screen.findByText("abc123")).toBeDefined();

    await act(() => queryClient.refetchQueries({ queryKey: ["deployed-version"] }));
    await waitFor(() =>
      expect(queryClient.getQueryState(["deployed-version"])?.status).toBe("error"),
    );
    expect(screen.getByText("abc123")).toBeDefined();
    expect(screen.queryByText("Version endpoint unreachable.")).toBeNull();
  });
});

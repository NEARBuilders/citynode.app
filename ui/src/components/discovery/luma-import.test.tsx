// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { LumaImport } from "./luma-import";

const api = vi.hoisted(() => ({
  listDiscoveryLumaCalendars: vi.fn(),
  importDiscoveryLuma: vi.fn(),
  disconnectDiscoveryLuma: vi.fn(),
}));

vi.mock("@/app", () => ({ useApiClient: () => api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type ImportResult = { imported: number; updated: number; withdrawn: number; skipped: number };

async function connectCalendar(counts: Partial<ImportResult>) {
  api.listDiscoveryLumaCalendars.mockResolvedValue({
    calendars: [{ id: "cal-1", name: "City Events" }],
    connection: null,
    unavailableCount: 0,
  });
  api.importDiscoveryLuma.mockResolvedValue({
    imported: 0,
    updated: 0,
    withdrawn: 0,
    skipped: 0,
    ...counts,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LumaImport nodeId="node-1" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByTestId("discovery-luma-calendar"));
  const option = await screen.findByRole("option", { name: "City Events" });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  const result = await screen.findByTestId("luma-import.result");
  await waitFor(() => expect(result.querySelectorAll("p").length).toBeGreaterThan(0));
  return [...result.querySelectorAll("p")].map((line) => line.textContent);
}

describe("LumaImport", () => {
  it("tells the owner how many events were imported and that they stay hidden", async () => {
    const lines = await connectCalendar({ imported: 3 });
    expect(api.importDiscoveryLuma).toHaveBeenCalledWith({ nodeId: "node-1", calendarId: "cal-1" });
    expect(lines).toEqual(["Imported 3 events. Imported events stay hidden until you show them."]);
  });

  it("says when only already imported events were updated", async () => {
    expect(await connectCalendar({ updated: 1 })).toEqual([
      "No new events. Updated 1 event already imported.",
    ]);
  });

  it("explains events hidden because they are no longer on the calendar", async () => {
    expect(await connectCalendar({ withdrawn: 2 })).toEqual([
      "2 events are no longer public on this Luma calendar, so they were hidden.",
    ]);
  });

  it("explains events skipped because they are already on the community", async () => {
    expect(await connectCalendar({ skipped: 1 })).toEqual([
      "No new events. 1 event was skipped because it's already on your community.",
    ]);
  });

  it("says when a calendar had no new events", async () => {
    expect(await connectCalendar({})).toEqual(["No new events found."]);
  });

  it("stacks one line per non-zero count", async () => {
    expect(await connectCalendar({ imported: 1, updated: 4, withdrawn: 1, skipped: 2 })).toEqual([
      "Imported 1 event. Imported events stay hidden until you show them.",
      "Updated 4 events already imported.",
      "2 events were skipped because they're already on your community.",
      "1 event is no longer public on this Luma calendar, so it was hidden.",
    ]);
  });

  it("clears the import result once the calendar is disconnected", async () => {
    const calendars = [{ id: "cal-1", name: "City Events" }];
    const connected = {
      calendars,
      connection: {
        calendarId: "cal-1",
        calendarName: "City Events",
        syncedAt: new Date().toISOString(),
        error: null,
      },
      unavailableCount: 0,
    };
    const disconnected = { calendars, connection: null, unavailableCount: 0 };
    api.listDiscoveryLumaCalendars.mockResolvedValue(disconnected);
    api.importDiscoveryLuma.mockImplementation(async () => {
      api.listDiscoveryLumaCalendars.mockResolvedValue(connected);
      return { imported: 2, updated: 0, withdrawn: 0, skipped: 0 };
    });
    api.disconnectDiscoveryLuma.mockImplementation(async () => {
      api.listDiscoveryLumaCalendars.mockResolvedValue(disconnected);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LumaImport nodeId="node-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("discovery-luma-calendar"));
    const option = await screen.findByRole("option", { name: "City Events" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await screen.findByTestId("luma-import.result");
    fireEvent.click(await screen.findByTestId("discovery-luma-disconnect"));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("discovery-luma-disconnect")).toBeNull());
    expect(api.disconnectDiscoveryLuma).toHaveBeenCalledWith({ nodeId: "node-1" });
    expect(screen.queryByTestId("luma-import.result")).toBeNull();
  });

  it("names no new events once when updates and skips stack", async () => {
    expect(await connectCalendar({ updated: 2, skipped: 1 })).toEqual([
      "No new events. Updated 2 events already imported.",
      "1 event was skipped because it's already on your community.",
    ]);
  });
});
